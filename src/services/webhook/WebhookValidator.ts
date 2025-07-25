import { IncomingMessage } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { Logger } from '../../utils/logger';
import { MastodonPingBot } from '../../bot';

export interface WebhookRequest {
  provider: string; // Will be auto-detected from URL path if not provided
  message?: string;
  accounts?: string[];
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  metadata?: Record<string, unknown>;
  // JSON workflow support
  json?: unknown; // JSON data for template processing
  template?: string; // Template to apply to JSON data (overrides config template)
  templateName?: string; // Named template from provider config (e.g., "github.push")
  // Multi-JSON workflow support
  uniqueKey?: string; // Unique key for multi-JSON iteration (default: "id")
  // Attachment support
  attachmentsKey?: string; // JSON key containing attachments array
  attachmentDataKey?: string; // JSON key for base64 data (default: "data")
  attachmentMimeTypeKey?: string; // JSON key for MIME type (default: "mimeType")
  attachmentFilenameKey?: string; // JSON key for filename (default: "filename")
  attachmentDescriptionKey?: string; // JSON key for description (default: "description")
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface WebhookConfig {
  enabled: boolean;
  port: number;
  host?: string;
  path?: string;
  secret?: string;
  hmacSecret?: string;
  hmacAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  hmacHeader?: string;
  allowedIPs?: string[];
  maxPayloadSize?: number;
  timeout?: number;
}

/**
 * Handles webhook request validation including authentication, path validation, and request structure validation
 */
export class WebhookValidator {
  private config: WebhookConfig;
  private bot: MastodonPingBot;
  private logger: Logger;

  constructor(config: WebhookConfig, bot: MastodonPingBot, logger: Logger) {
    this.config = config;
    this.bot = bot;
    this.logger = logger;
  }

  /**
   * Validates webhook path and returns webhook type and provider info
   */
  public validateWebhookPath(pathname: string): { 
    isValidPath: boolean; 
    webhookType: 'generic' | 'provider-specific';
    providerName?: string;
  } {
    // Check main webhook path (generic webhook)
    if (pathname === this.config.path) {
      return { isValidPath: true, webhookType: 'generic' };
    }

    // Check provider-specific paths
    try {
      const botConfig = this.bot.getConfig();
      for (const providerConfig of botConfig.bot.providers) {
        if (providerConfig.webhookPath && pathname === providerConfig.webhookPath) {
          this.logger.debug(`Matched provider-specific webhook path: ${pathname} -> ${providerConfig.name}`);
          return { 
            isValidPath: true, 
            webhookType: 'provider-specific',
            providerName: providerConfig.name 
          };
        }
      }
    } catch {
      // If bot config is not available (e.g., in tests), just check main path
      this.logger.debug('Bot config not available for provider path validation');
    }

    return { isValidPath: false, webhookType: 'generic' };
  }

  /**
   * Validates the webhook request structure and content
   */
  public validateWebhookRequest(
    body: unknown, 
    webhookType: 'generic' | 'provider-specific',
    autoDetectedProvider?: string
  ): WebhookRequest {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be a JSON object');
    }

    // Type assertion after validation
    const bodyObj = body as Record<string, unknown>;

    // Handle provider validation based on webhook type
    let providerName: string;
    
    if (webhookType === 'provider-specific') {
      // Provider-specific webhook: provider is determined by URL path
      if (!autoDetectedProvider) {
        throw new ValidationError('Internal error: provider-specific webhook without provider name');
      }
      providerName = autoDetectedProvider;
      
      // Provider field in JSON is ignored for provider-specific webhooks
      if (bodyObj.provider && typeof bodyObj.provider === 'string' && bodyObj.provider !== autoDetectedProvider) {
        this.logger.warn(`Provider field "${bodyObj.provider}" in JSON ignored for provider-specific webhook. Using URL-determined provider: ${autoDetectedProvider}`);
      }
      
      // For provider-specific webhooks, the entire body IS the JSON data
      // No need for a separate 'json' field - the whole payload is the data
      bodyObj.json = bodyObj;
    } else {
      // Generic webhook: provider must be specified in JSON
      if (!bodyObj.provider || typeof bodyObj.provider !== 'string') {
        throw new ValidationError('Provider name is required and must be a string when using the generic webhook path');
      }
      providerName = bodyObj.provider;
    }

    // Basic field type validation
    if (bodyObj.message && typeof bodyObj.message !== 'string') {
      throw new ValidationError('Message must be a string');
    }

    if (bodyObj.template && typeof bodyObj.template !== 'string') {
      throw new ValidationError('Template must be a string');
    }

    // JSON workflow validation (only if JSON fields are provided)
    if (bodyObj.json !== undefined || bodyObj.template) {
      // If json is provided, template is required
      // Template validation for JSON data will be done later in processJsonWorkflow
      // where we can check provider config templates

      // If template is provided, json is required
      if (bodyObj.template && bodyObj.json === undefined) {
        throw new ValidationError('JSON data is required when template is provided');
      }
    }

    if (bodyObj.accounts && !Array.isArray(bodyObj.accounts)) {
      throw new ValidationError('Accounts must be an array');
    }

    if (bodyObj.accounts && Array.isArray(bodyObj.accounts) && bodyObj.accounts.some((acc: unknown) => typeof acc !== 'string')) {
      throw new ValidationError('All account names must be strings');
    }

    if (bodyObj.visibility && typeof bodyObj.visibility !== 'string') {
      throw new ValidationError('Visibility must be a string');
    }

    if (bodyObj.visibility && !['public', 'unlisted', 'private', 'direct'].includes(bodyObj.visibility as string)) {
      throw new ValidationError('Visibility must be one of: public, unlisted, private, direct');
    }

    // Validate JSON workflow fields
    if (bodyObj.templateName && typeof bodyObj.templateName !== 'string') {
      throw new ValidationError('templateName must be a string');
    }

    if (bodyObj.uniqueKey && typeof bodyObj.uniqueKey !== 'string') {
      throw new ValidationError('uniqueKey must be a string');
    }

    if (bodyObj.attachmentsKey && typeof bodyObj.attachmentsKey !== 'string') {
      throw new ValidationError('attachmentsKey must be a string');
    }

    if (bodyObj.attachmentDataKey && typeof bodyObj.attachmentDataKey !== 'string') {
      throw new ValidationError('attachmentDataKey must be a string');
    }

    if (bodyObj.attachmentMimeTypeKey && typeof bodyObj.attachmentMimeTypeKey !== 'string') {
      throw new ValidationError('attachmentMimeTypeKey must be a string');
    }

    if (bodyObj.attachmentFilenameKey && typeof bodyObj.attachmentFilenameKey !== 'string') {
      throw new ValidationError('attachmentFilenameKey must be a string');
    }

    if (bodyObj.attachmentDescriptionKey && typeof bodyObj.attachmentDescriptionKey !== 'string') {
      throw new ValidationError('attachmentDescriptionKey must be a string');
    }

    return {
      provider: providerName,
      message: bodyObj.message as string | undefined,
      accounts: bodyObj.accounts as string[] | undefined,
      visibility: bodyObj.visibility as 'public' | 'unlisted' | 'private' | 'direct' | undefined,
      metadata: (bodyObj.metadata as Record<string, unknown>) || {},
      // JSON workflow fields
      json: bodyObj.json,
      template: bodyObj.template as string | undefined,
      templateName: bodyObj.templateName as string | undefined,
      uniqueKey: bodyObj.uniqueKey as string | undefined,
      // Attachment fields
      attachmentsKey: bodyObj.attachmentsKey as string | undefined,
      attachmentDataKey: bodyObj.attachmentDataKey as string | undefined,
      attachmentMimeTypeKey: bodyObj.attachmentMimeTypeKey as string | undefined,
      attachmentFilenameKey: bodyObj.attachmentFilenameKey as string | undefined,
      attachmentDescriptionKey: bodyObj.attachmentDescriptionKey as string | undefined
    };
  }

  /**
   * Validates webhook authentication (HMAC signature or simple secret) for a specific provider
   */
  public validateWebhookAuth(providerName: string, req: IncomingMessage, rawBody: string): boolean {
    const pushProvider = this.bot.getPushProvider(providerName);
    
    // Try provider-specific HMAC first
    if (pushProvider && typeof pushProvider.getHmacSecret === 'function') {
      const providerHmacSecret = pushProvider.getHmacSecret();
      if (providerHmacSecret) {
        const algorithm = (typeof pushProvider.getHmacAlgorithm === 'function' ? pushProvider.getHmacAlgorithm() : undefined) || this.config.hmacAlgorithm || 'sha256';
        const headerName = (typeof pushProvider.getHmacHeader === 'function' ? pushProvider.getHmacHeader() : undefined) || this.config.hmacHeader || 'X-Hub-Signature-256';
        return this.validateHmacSignature(rawBody, providerHmacSecret, algorithm, headerName, req);
      }
    }

    // Try global HMAC
    if (this.config.hmacSecret) {
      const algorithm = this.config.hmacAlgorithm || 'sha256';
      const headerName = this.config.hmacHeader || 'X-Hub-Signature-256';
      return this.validateHmacSignature(rawBody, this.config.hmacSecret, algorithm, headerName, req);
    }

    // Try provider-specific simple secret
    if (pushProvider && typeof pushProvider.getWebhookSecret === 'function') {
      const providerSecret = pushProvider.getWebhookSecret();
      if (providerSecret) {
        const providedSecret = req.headers['x-webhook-secret'] as string;
        return providedSecret === providerSecret;
      }
    }

    // Try global simple secret
    if (this.config.secret) {
      const providedSecret = req.headers['x-webhook-secret'] as string;
      return providedSecret === this.config.secret;
    }

    // No authentication configured - allow request (webhook password is now optional)
    this.logger.debug('No webhook authentication configured, allowing request');
    return true;
  }

  /**
   * Validates HMAC signature
   */
  private validateHmacSignature(
    payload: string, 
    secret: string, 
    algorithm: 'sha1' | 'sha256' | 'sha512', 
    headerName: string, 
    req: IncomingMessage
  ): boolean {
    const providedSignature = req.headers[headerName.toLowerCase()] as string;
    if (!providedSignature) {
      this.logger.debug(`No HMAC signature found in header: ${headerName}`);
      return false;
    }

    try {
      // Create expected signature
      const hmac = createHmac(algorithm, secret);
      hmac.update(payload, 'utf8');
      const expectedSignature = `${algorithm}=${hmac.digest('hex')}`;

      // Use timing-safe comparison
      const providedBuffer = Buffer.from(providedSignature, 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

      if (providedBuffer.length !== expectedBuffer.length) {
        this.logger.debug('HMAC signature length mismatch');
        return false;
      }

      const isValid = timingSafeEqual(providedBuffer, expectedBuffer);
      if (!isValid) {
        this.logger.debug('HMAC signature validation failed');
      }
      return isValid;
    } catch (error) {
      this.logger.error('HMAC signature validation error:', error);
      return false;
    }
  }

  /**
   * Validates IP whitelist
   */
  public validateClientIP(req: IncomingMessage): boolean {
    if (!this.config.allowedIPs || this.config.allowedIPs.length === 0) {
      return true; // No IP restrictions
    }

    const clientIP = this.getClientIP(req);
    const isAllowed = this.config.allowedIPs.includes(clientIP);
    
    if (!isAllowed) {
      this.logger.warn(`Webhook request from unauthorized IP: ${clientIP}`);
    }
    
    return isAllowed;
  }

  /**
   * Gets the client IP address
   */
  private getClientIP(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const remoteAddress = req.socket.remoteAddress || 'unknown';
    
    // Normalize IPv6-mapped IPv4 addresses to IPv4
    if (remoteAddress.startsWith('::ffff:')) {
      return remoteAddress.substring(7);
    }
    
    return remoteAddress;
  }

  /**
   * Sanitizes headers for logging (removes sensitive information)
   */
  public sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
    const sanitized: Record<string, string | string[]> = {};
    const sensitiveHeaders = ['authorization', 'x-webhook-secret', 'x-hub-signature', 'x-hub-signature-256', 'x-gitlab-token'];
    
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        const lowerKey = key.toLowerCase();
        if (sensitiveHeaders.some(sensitive => lowerKey.includes(sensitive))) {
          // Show only first and last 4 characters for sensitive headers
          const stringValue = Array.isArray(value) ? value[0] : value;
          if (stringValue && stringValue.length > 8) {
            sanitized[key] = `${stringValue.substring(0, 4)}...${stringValue.substring(stringValue.length - 4)}`;
          } else {
            sanitized[key] = '***';
          }
        } else {
          sanitized[key] = value;
        }
      }
    }
    
    return sanitized;
  }
}