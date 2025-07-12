import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { createHmac, timingSafeEqual } from 'crypto';
import { Logger } from '../utils/logger';
import { MastodonPingBot } from '../bot';
import type { TelemetryService } from './telemetryInterface';
import { MessageWithAttachments } from '../messages/messageProvider';
import { JsonTemplateProcessor, AttachmentConfig } from '../utils/jsonTemplateProcessor';

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

export interface WebhookRequest {
  provider: string;
  message?: string;
  accounts?: string[];
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  metadata?: Record<string, unknown>;
  // JSON workflow support
  json?: unknown; // JSON data for template processing
  template?: string; // Template to apply to JSON data
  // Multi-JSON workflow support
  uniqueKey?: string; // Unique key for multi-JSON iteration (default: "id")
  // Attachment support
  attachmentsKey?: string; // JSON key containing attachments array
  attachmentDataKey?: string; // JSON key for base64 data (default: "data")
  attachmentMimeTypeKey?: string; // JSON key for MIME type (default: "mimeType")
  attachmentFilenameKey?: string; // JSON key for filename (default: "filename")
  attachmentDescriptionKey?: string; // JSON key for description (default: "description")
}

export interface WebhookResponse {
  success: boolean;
  message: string;
  timestamp: string;
  provider?: string;
  accounts?: string[];
}

export class WebhookServer {
  private server: ReturnType<typeof createServer> | null = null;
  private config: WebhookConfig;
  private logger: Logger;
  private bot: MastodonPingBot;
  private telemetry: TelemetryService;
  private templateProcessor: JsonTemplateProcessor;
  private isRunning = false;

  constructor(config: WebhookConfig, bot: MastodonPingBot, logger: Logger, telemetry: TelemetryService) {
    this.config = {
      host: '0.0.0.0',
      path: '/webhook',
      maxPayloadSize: 1024 * 1024, // 1MB
      timeout: 30000, // 30 seconds
      hmacAlgorithm: 'sha256', // Default HMAC algorithm
      hmacHeader: 'X-Hub-Signature-256', // Default HMAC header
      ...config
    };
    this.bot = bot;
    this.logger = logger;
    this.telemetry = telemetry;
    this.templateProcessor = new JsonTemplateProcessor(logger);
  }

  /**
   * Starts the webhook server
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Webhook server is already running');
      return;
    }

    if (!this.config.enabled) {
      this.logger.info('Webhook server is disabled');
      return;
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch(error => {
        this.logger.error('Webhook request handling failed:', error);
        this.sendErrorResponse(res, 500, 'Internal server error');
      });
    });

    if (this.config.timeout) {
      this.server.timeout = this.config.timeout;
    }

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        // Update config with actual assigned port (important for port: 0)
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.config.port = address.port;
        }
        this.logger.info(`Webhook server started on ${this.config.host}:${this.config.port}${this.config.path}`);
        resolve();
      });

      this.server!.on('error', (error: Error) => {
        this.logger.error('Webhook server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stops the webhook server
   */
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.logger.info('Webhook server stopped');
        resolve();
      });
    });
  }

  /**
   * Handles incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const span = this.telemetry.startSpan('webhook.handle_request', {
      'http.method': req.method || 'unknown',
      'http.url': req.url || 'unknown',
      'http.user_agent': req.headers['user-agent'] || '',
    });

    try {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret, X-Hub-Signature, X-Hub-Signature-256, X-Hub-Signature-512');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Only allow POST requests
      if (req.method !== 'POST') {
        this.sendErrorResponse(res, 405, 'Method not allowed');
        return;
      }

      // Check path
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      if (url.pathname !== this.config.path) {
        this.sendErrorResponse(res, 404, 'Not found');
        return;
      }

      // Check IP whitelist
      if (this.config.allowedIPs && this.config.allowedIPs.length > 0) {
        const clientIP = this.getClientIP(req);
        if (!this.config.allowedIPs.includes(clientIP)) {
          this.logger.warn(`Webhook request from unauthorized IP: ${clientIP}`);
          this.sendErrorResponse(res, 403, 'Forbidden');
          return;
        }
      }

      // Parse request body and get raw body for HMAC validation
      const { body, rawBody } = await this.parseRequestBody(req);
      const webhookRequest = this.validateWebhookRequest(body);

      // Verify authentication (HMAC signature or simple secret)
      if (!this.validateWebhookAuth(webhookRequest.provider, req, rawBody)) {
        this.logger.warn(`Webhook request with invalid authentication for provider: ${webhookRequest.provider}`);
        this.sendErrorResponse(res, 401, 'Unauthorized');
        return;
      }

      span?.setAttributes({
        'webhook.provider': webhookRequest.provider,
        'webhook.has_message': !!webhookRequest.message,
        'webhook.accounts_count': webhookRequest.accounts?.length || 0,
      });

      // Process webhook request
      const result = await this.processWebhookRequest(webhookRequest);

      // Send success response
      this.sendSuccessResponse(res, result);

      const durationSeconds = (Date.now() - startTime) / 1000;
      this.telemetry.recordWebhookRequest(webhookRequest.provider, durationSeconds);
      
      span?.setStatus({ code: 1 }); // OK

    } catch (error) {
      this.logger.error('Webhook request processing failed:', error);
      this.telemetry.recordError('webhook_processing_failed', 'webhook');
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      
      if (error instanceof ValidationError) {
        this.sendErrorResponse(res, 400, error.message);
      } else if (error instanceof Error && error.message.includes('rate limited')) {
        // Rate limiting error - return 429 Too Many Requests
        this.sendErrorResponse(res, 429, error.message);
      } else {
        this.sendErrorResponse(res, 500, 'Internal server error');
      }
    } finally {
      span?.end();
    }
  }

  /**
   * Parses the request body and returns both parsed JSON and raw body
   */
  private async parseRequestBody(req: IncomingMessage): Promise<{ body: unknown; rawBody: string }> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > this.config.maxPayloadSize!) {
          reject(new ValidationError('Payload too large'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ body: parsed, rawBody: body });
        } catch {
          reject(new ValidationError('Invalid JSON payload'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Validates the webhook request
   */
  private validateWebhookRequest(body: unknown): WebhookRequest {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be a JSON object');
    }

    // Type assertion after validation
    const bodyObj = body as Record<string, unknown>;

    if (!bodyObj.provider || typeof bodyObj.provider !== 'string') {
      throw new ValidationError('Provider name is required and must be a string');
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
      if (bodyObj.json !== undefined && !bodyObj.template) {
        throw new ValidationError('Template is required when json data is provided');
      }

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
      provider: bodyObj.provider as string,
      message: bodyObj.message as string | undefined,
      accounts: bodyObj.accounts as string[] | undefined,
      visibility: bodyObj.visibility as 'public' | 'unlisted' | 'private' | 'direct' | undefined,
      metadata: (bodyObj.metadata as Record<string, unknown>) || {},
      // JSON workflow fields
      json: bodyObj.json,
      template: bodyObj.template as string | undefined,
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
   * Processes the webhook request
   */
  private async processWebhookRequest(request: WebhookRequest): Promise<WebhookResponse> {
    this.logger.info(`Processing webhook for provider: ${request.provider}`);

    // Check if provider exists and is a push provider
    if (!this.bot.isPushProvider(request.provider)) {
      throw new ValidationError(`Provider "${request.provider}" is not a push provider or does not exist`);
    }

    let processedMessages: MessageWithAttachments[] = [];

    // Process JSON workflow if provided
    if (request.json && request.template) {
      processedMessages = await this.processJsonWorkflow(request);
    } else {
      // Traditional message workflow (allow undefined message for backward compatibility)
      processedMessages = [{ text: request.message || '', attachments: undefined }];
    }

    // Process each message (for multi-JSON support)
    let successCount = 0;
    const errors: string[] = [];

    for (const messageData of processedMessages) {
      try {
        // Trigger the push provider with the processed message
        if (typeof this.bot.triggerPushProviderWithVisibilityAndAttachments === 'function') {
          await this.bot.triggerPushProviderWithVisibilityAndAttachments(
            request.provider, 
            messageData.text, 
            request.visibility,
            messageData.attachments
          );
        } else if (typeof this.bot.triggerPushProviderWithVisibility === 'function') {
          await this.bot.triggerPushProviderWithVisibility(request.provider, messageData.text, request.visibility);
        } else {
          // Fallback for backward compatibility (tests)
          await this.bot.triggerPushProvider(request.provider, messageData.text);
        }
        successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);
        this.logger.error(`Failed to process message for provider ${request.provider}: ${errorMessage}`);
      }
    }

    if (successCount === 0 && errors.length > 0) {
      throw new Error(`All messages failed: ${errors.join(', ')}`);
    }

    const response: WebhookResponse = {
      success: true,
      message: processedMessages.length > 1 
        ? `Successfully processed ${successCount}/${processedMessages.length} messages for provider "${request.provider}"`
        : `Successfully triggered push provider "${request.provider}"`,
      timestamp: new Date().toISOString(),
      provider: request.provider
    };

    // Add accounts info if available
    const pushProviders = this.bot.getPushProviders();
    const providerInfo = pushProviders.find(p => p.name === request.provider);
    if (providerInfo) {
      // Get accounts from provider config (this would need to be exposed by the bot)
      const providerDetails = this.bot.getProviderInfo().find(p => p.name === request.provider);
      if (providerDetails) {
        // Note: We'd need to expose account info from the bot for this to work
        response.accounts = request.accounts || [];
      }
    }

    if (errors.length > 0) {
      (response as any).warnings = errors;
    }

    this.logger.info(`Webhook processed successfully for provider: ${request.provider} (${successCount}/${processedMessages.length} messages)`);
    return response;
  }

  /**
   * Sends a success response
   */
  private sendSuccessResponse(res: ServerResponse, data: WebhookResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Sends an error response
   */
  private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
    const errorResponse = {
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    };

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse, null, 2));
  }

  /**
   * Validates webhook authentication (HMAC signature or simple secret) for a specific provider
   */
  private validateWebhookAuth(providerName: string, req: IncomingMessage, rawBody: string): boolean {
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
   * Returns whether the server is running
   */
  public isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Gets the server configuration
   */
  public getConfig(): WebhookConfig {
    return { ...this.config };
  }

  /**
   * Processes JSON workflow (single object or array)
   */
  private async processJsonWorkflow(request: WebhookRequest): Promise<MessageWithAttachments[]> {
    if (!request.json || !request.template) {
      throw new ValidationError('JSON data and template are required for JSON workflow');
    }

    const messages: MessageWithAttachments[] = [];

    // Handle array (multi-JSON workflow)
    if (Array.isArray(request.json)) {
      const uniqueKey = request.uniqueKey || 'id';
      
      for (let i = 0; i < request.json.length; i++) {
        const item = request.json[i];
        
        if (typeof item !== 'object' || item === null) {
          this.logger.warn(`JSON array item at index ${i} is not an object, skipping`);
          continue;
        }
        
        const jsonObj = item as Record<string, unknown>;
        const uniqueId = String(jsonObj[uniqueKey] || i);
        
        try {
          const message = this.templateProcessor.applyTemplate(request.template, jsonObj);
          const attachmentConfig: AttachmentConfig = {
            attachmentsKey: request.attachmentsKey,
            attachmentDataKey: request.attachmentDataKey,
            attachmentMimeTypeKey: request.attachmentMimeTypeKey,
            attachmentFilenameKey: request.attachmentFilenameKey,
            attachmentDescriptionKey: request.attachmentDescriptionKey
          };
          const attachments = this.templateProcessor.extractAttachments(jsonObj, attachmentConfig);
          
          messages.push({
            text: message,
            attachments: attachments.length > 0 ? attachments : undefined
          });
          
          this.logger.debug(`Processed JSON array item ${uniqueKey}="${uniqueId}": "${message}"`);
          if (attachments.length > 0) {
            this.logger.debug(`Found ${attachments.length} attachments for ${uniqueKey}="${uniqueId}"`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process JSON array item ${uniqueKey}="${uniqueId}": ${errorMessage}`);
          // Continue processing other items
        }
      }
    } else if (typeof request.json === 'object' && request.json !== null) {
      // Handle single object (JSON workflow)
      const jsonObj = request.json as Record<string, unknown>;
      
      try {
        const message = this.templateProcessor.applyTemplate(request.template, jsonObj);
        const attachmentConfig: AttachmentConfig = {
          attachmentsKey: request.attachmentsKey,
          attachmentDataKey: request.attachmentDataKey,
          attachmentMimeTypeKey: request.attachmentMimeTypeKey,
          attachmentFilenameKey: request.attachmentFilenameKey,
          attachmentDescriptionKey: request.attachmentDescriptionKey
        };
        const attachments = this.templateProcessor.extractAttachments(jsonObj, attachmentConfig);
        
        messages.push({
          text: message,
          attachments: attachments.length > 0 ? attachments : undefined
        });
        
        this.logger.debug(`Processed JSON object: "${message}"`);
        if (attachments.length > 0) {
          this.logger.debug(`Found ${attachments.length} attachments`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process JSON object: ${errorMessage}`);
        throw error;
      }
    } else {
      throw new ValidationError('JSON data must be an object or array');
    }

    if (messages.length === 0) {
      this.logger.warn('No valid messages generated from JSON data');
    }

    return messages;
  }

}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}