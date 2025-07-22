import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { createHmac, timingSafeEqual } from 'crypto';
import { VERSION } from '../version';
import { Logger } from '../utils/logger';
import { MastodonPingBot } from '../bot';
import type { TelemetryService } from './telemetryInterface';
import { MessageWithAttachments } from '../messages/messageProvider';
import { JsonTemplateProcessor, AttachmentConfig } from '../utils/jsonTemplateProcessor';
import { BaseConfigurableService } from './baseService';

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

export interface WebhookResponse {
  success: boolean;
  message: string;
  timestamp: string;
  provider?: string;
  accounts?: string[];
}

export class WebhookServer extends BaseConfigurableService<WebhookConfig> {
  private server: ReturnType<typeof createServer> | null = null;
  private bot: MastodonPingBot;
  private templateProcessor: JsonTemplateProcessor;
  private isRunning = false;

  constructor(config: WebhookConfig, bot: MastodonPingBot, logger: Logger, telemetry: TelemetryService) {
    const configWithDefaults: WebhookConfig = {
      host: '0.0.0.0',
      path: '/webhook',
      maxPayloadSize: 1024 * 1024, // 1MB
      timeout: 30000, // 30 seconds
      hmacAlgorithm: 'sha256' as const, // Default HMAC algorithm
      hmacHeader: 'X-Hub-Signature-256', // Default HMAC header
      ...config
    };

    // Validate webhook path doesn't conflict with health check endpoint
    if (configWithDefaults.path === '/health') {
      throw new Error('Webhook path cannot be "/health" as it conflicts with the health check endpoint');
    }

    super(configWithDefaults, logger, telemetry);
    this.bot = bot;
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
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }
      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        // Update config with actual assigned port (important for port: 0)
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.config.port = address.port;
        }
        this.logger.info(`Webhook server started on ${this.config.host}:${this.config.port}${this.config.path}`);
        resolve();
      });

      this.server.on('error', (error: Error) => {
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
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        this.isRunning = false;
        this.logger.info('Webhook server already stopped');
        resolve();
      }
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret, X-Hub-Signature, X-Hub-Signature-256, X-Hub-Signature-512');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Check path
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      
      // Handle health check endpoint
      if (url.pathname === '/health') {
        await this.handleHealthCheck(req, res);
        return;
      }

      // Only allow POST requests for webhook
      if (req.method !== 'POST') {
        this.sendErrorResponse(res, 405, 'Method not allowed');
        return;
      }

      // Check if this is the main webhook path or a provider-specific path
      const { isValidPath, webhookType, providerName } = this.validateWebhookPath(url.pathname);
      if (!isValidPath) {
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
      
      // Debug logging: Log incoming webhook payload 1:1
      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`Incoming webhook payload for ${webhookType} webhook:`, {
          url: url.pathname,
          method: req.method,
          headers: this.sanitizeHeaders(req.headers),
          body: body,
          rawBodyLength: rawBody.length,
          providerName: providerName || 'auto-detect'
        });
      }
      
      const webhookRequest = this.validateWebhookRequest(body, webhookType, providerName);

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
        if (size > (this.config.maxPayloadSize || 1024 * 1024)) {
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
   * Validates webhook path and returns webhook type and provider info
   */
  private validateWebhookPath(pathname: string): { 
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
   * Validates the webhook request
   */
  private validateWebhookRequest(
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
      
      // For provider-specific webhooks, JSON data is required (no simple message workflow)
      // The JSON data can be either in a 'json' field or the entire body can be the JSON data
      if (!bodyObj.json && !this.isValidJsonData(bodyObj)) {
        throw new ValidationError(`Provider-specific webhook requires JSON data. Use the generic webhook path ${this.config.path} for simple message workflows.`);
      }
      
      // If the entire body is JSON data (not wrapped in a 'json' field), use it directly
      if (!bodyObj.json && this.isValidJsonData(bodyObj)) {
        bodyObj.json = bodyObj;
      }
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
   * Processes the webhook request
   */
  private async processWebhookRequest(request: WebhookRequest): Promise<WebhookResponse> {
    this.logger.info(`Processing webhook for provider: ${request.provider}`);

    // Check if provider exists and is a push provider
    if (!this.bot.isPushProvider(request.provider)) {
      throw new ValidationError(`Provider "${request.provider}" is not a push provider or does not exist`);
    }

    let processedMessages: MessageWithAttachments[] = [];

    // Process JSON workflow if provided, or if we have JSON data and a template in config
    if (request.json) {
      // Try to resolve template from config if not provided
      const template = this.resolveTemplate(request);
      if (template) {
        processedMessages = await this.processJsonWorkflow(request);
      } else if (request.message) {
        // Fallback to simple message if no template found
        processedMessages = [{ text: request.message, attachments: undefined }];
      } else {
        // More helpful error message with configuration guidance
        const providerInfo = this.bot.getProviderInfo().find(p => p.name === request.provider);
        if (providerInfo) {
          throw new ValidationError(`No template configured for provider "${request.provider}". Please add a 'template' field to the provider configuration, or provide a 'template' or 'message' in the webhook request.`);
        } else {
          throw new ValidationError(`Provider "${request.provider}" not found. Please check the provider name or configure the provider in your config.toml file.`);
        }
      }
    } else if (request.message) {
      // Traditional message workflow
      processedMessages = [{ text: request.message, attachments: undefined }];
    } else {
      throw new ValidationError('Either JSON data with template or a message is required');
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
      (response as { warnings?: string[] }).warnings = errors;
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
   * Handles health check requests
   */
  private async handleHealthCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Allow GET and HEAD requests for health checks
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        this.sendErrorResponse(res, 405, 'Method not allowed');
        return;
      }

      const healthResponse = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'buntspecht-webhook-server',
        version: VERSION.toString(),
        webhook_enabled: this.config.enabled,
        webhook_path: this.config.path,
        webhook_port: this.config.port
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthResponse, null, 2));
    } catch (error) {
      this.logger.error('Health check failed:', error);
      this.sendErrorResponse(res, 500, 'Health check failed');
    }
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
    if (!request.json) {
      throw new ValidationError('JSON data is required for JSON workflow');
    }

    // Resolve template from various sources
    const template = this.resolveTemplate(request);
    if (!template) {
      throw new ValidationError('Template is required for JSON workflow. Provide template, templateName, or configure a default template for the provider.');
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
          const message = this.templateProcessor.applyTemplate(template, jsonObj);
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
        const message = this.templateProcessor.applyTemplate(template, jsonObj);
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

  /**
   * Resolves template from various sources in priority order:
   * 1. Explicit template in request (highest priority)
   * 2. Named template from provider config
   * 3. Default template from provider config
   */
  private resolveTemplate(request: WebhookRequest): string | null {
    // 1. Explicit template in request (overrides everything)
    if (request.template) {
      this.logger.debug(`Using explicit template from request for provider: ${request.provider}`);
      return request.template;
    }

    // Get provider configuration
    const providerInfo = this.bot.getProviderInfo().find(p => p.name === request.provider);
    if (!providerInfo) {
      this.logger.warn(`Provider "${request.provider}" not found in configuration`);
      return null;
    }

    // Get provider config from bot (we need access to the full config)
    let botConfig;
    try {
      botConfig = this.bot.getConfig();
    } catch (error) {
      this.logger.warn(`Failed to get bot config for template resolution: ${(error as Error).message}`);
      return null;
    }

    const providerConfig = botConfig.bot.providers.find(p => p.name === request.provider);
    if (!providerConfig) {
      this.logger.warn(`Provider configuration not found for: ${request.provider}`);
      return null;
    }

    // 2. Named template from provider config
    if (request.templateName && providerConfig.templates) {
      const namedTemplate = providerConfig.templates[request.templateName];
      if (namedTemplate) {
        this.logger.debug(`Using named template "${request.templateName}" from provider config for: ${request.provider}`);
        return namedTemplate;
      } else {
        this.logger.warn(`Named template "${request.templateName}" not found in provider "${request.provider}" config`);
      }
    }

    // 3. Default template from provider config
    if (providerConfig.template) {
      this.logger.debug(`Using default template from provider config for: ${request.provider}`);
      return providerConfig.template;
    }

    // No template found
    this.logger.debug(`No template found for provider: ${request.provider}`);
    return null;
  }

  /**
   * Sanitizes headers for logging (removes sensitive information)
   */
  private sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
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

  /**
   * Checks if the provided object contains valid JSON data for processing
   * (i.e., it's not just a simple message or provider field)
   */
  private isValidJsonData(obj: Record<string, unknown>): boolean {
    // If it only contains 'provider' and/or 'message', it's not valid JSON data
    const keys = Object.keys(obj);
    const systemFields = ['provider', 'message', 'accounts', 'visibility', 'template', 'templateName', 'uniqueKey', 'attachmentsKey', 'attachmentDataKey', 'attachmentMimeTypeKey', 'attachmentFilenameKey', 'attachmentDescriptionKey'];
    
    // Check if there are any keys that are not system fields
    const hasDataFields = keys.some(key => !systemFields.includes(key));
    
    return hasDataFields;
  }

}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}