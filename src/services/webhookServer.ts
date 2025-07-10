import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { Logger } from '../utils/logger';
import { MastodonPingBot } from '../bot';
import type { TelemetryService } from './telemetryInterface';
import { MessageWithAttachments, Attachment } from '../messages/messageProvider';

export interface WebhookConfig {
  enabled: boolean;
  port: number;
  host?: string;
  path?: string;
  secret?: string;
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
  private isRunning = false;

  constructor(config: WebhookConfig, bot: MastodonPingBot, logger: Logger, telemetry: TelemetryService) {
    this.config = {
      host: '0.0.0.0',
      path: '/webhook',
      maxPayloadSize: 1024 * 1024, // 1MB
      timeout: 30000, // 30 seconds
      ...config
    };
    this.bot = bot;
    this.logger = logger;
    this.telemetry = telemetry;
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');

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

      // Parse request body
      const body = await this.parseRequestBody(req);
      const webhookRequest = this.validateWebhookRequest(body);

      // Verify secret (provider-specific or global)
      const providedSecret = req.headers['x-webhook-secret'] as string;
      if (!this.validateWebhookSecret(webhookRequest.provider, providedSecret)) {
        this.logger.warn(`Webhook request with invalid secret for provider: ${webhookRequest.provider}`);
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
   * Parses the request body
   */
  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
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
          resolve(parsed);
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
   * Validates webhook secret for a specific provider
   */
  private validateWebhookSecret(providerName: string, providedSecret: string | undefined): boolean {
    // Get provider-specific secret first
    const pushProvider = this.bot.getPushProvider(providerName);
    if (pushProvider && typeof pushProvider.getWebhookSecret === 'function') {
      const providerSecret = pushProvider.getWebhookSecret();
      if (providerSecret) {
        // Provider has its own secret, use it
        return providedSecret === providerSecret;
      }
    }

    // Fall back to global webhook secret (required when webhook is enabled)
    if (this.config.secret) {
      return providedSecret === this.config.secret;
    }

    // This should never happen due to config validation, but fail securely
    this.logger.error('No webhook secret configured (neither provider-specific nor global). This is a configuration error.');
    return false;
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
          const message = this.applyTemplate(request.template, jsonObj);
          const attachments = this.extractAttachments(jsonObj, request);
          
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
        const message = this.applyTemplate(request.template, jsonObj);
        const attachments = this.extractAttachments(jsonObj, request);
        
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
   * Applies a template string with variables from JSON data
   * Supports syntax like {{variable}}, {{nested.property}}, and {{variable|trim:50}}
   */
  private applyTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const trimmedExpression = expression.trim();
      
      // Check if expression contains a function call (pipe syntax)
      const pipeIndex = trimmedExpression.indexOf('|');
      let path: string;
      let functionCall: string | null = null;
      
      if (pipeIndex !== -1) {
        path = trimmedExpression.substring(0, pipeIndex).trim();
        functionCall = trimmedExpression.substring(pipeIndex + 1).trim();
      } else {
        path = trimmedExpression;
      }
      
      const value = this.getNestedProperty(data, path);
      
      if (value === undefined || value === null) {
        this.logger.warn(`Template variable "${path}" not found in JSON data`);
        return match; // Return the original placeholder if variable not found
      }
      
      let result = String(value);
      
      // Apply function if specified
      if (functionCall) {
        result = this.applyTemplateFunction(result, functionCall, path);
      }
      
      return result;
    });
  }

  /**
   * Applies a template function to a value
   * Currently supports: trim:length
   */
  private applyTemplateFunction(value: string, functionCall: string, variablePath: string): string {
    const colonIndex = functionCall.indexOf(':');
    let functionName: string;
    let functionArgs: string[] = [];
    
    if (colonIndex !== -1) {
      functionName = functionCall.substring(0, colonIndex).trim();
      const argsString = functionCall.substring(colonIndex + 1);
      // Split by comma but preserve commas within the suffix argument
      const firstCommaIndex = argsString.indexOf(',');
      if (firstCommaIndex !== -1) {
        functionArgs = [
          argsString.substring(0, firstCommaIndex).trim(),
          argsString.substring(firstCommaIndex + 1).trim()
        ];
      } else {
        functionArgs = [argsString.trim()];
      }
    } else {
      functionName = functionCall.trim();
    }
    
    switch (functionName) {
      case 'trim':
        return this.trimFunction(value, functionArgs, variablePath);
      default:
        this.logger.warn(`Unknown template function "${functionName}" for variable "${variablePath}"`);
        return value; // Return original value if function is unknown
    }
  }

  /**
   * Trims a string to a specified maximum length
   * Usage: {{variable|trim:50}} or {{variable|trim:50,...}}
   * Args: [maxLength, suffix?]
   */
  private trimFunction(value: string, args: string[], variablePath: string): string {
    if (args.length === 0) {
      this.logger.warn(`trim function requires at least one argument (maxLength) for variable "${variablePath}"`);
      return value;
    }
    
    const maxLengthStr = args[0];
    const maxLength = parseInt(maxLengthStr, 10);
    
    if (isNaN(maxLength) || maxLength < 0) {
      this.logger.warn(`Invalid maxLength "${maxLengthStr}" for trim function on variable "${variablePath}". Must be a non-negative integer.`);
      return value;
    }
    
    if (value.length <= maxLength) {
      return value; // No trimming needed
    }
    
    // Optional suffix (default: "...")
    const suffix = args.length > 1 ? args[1] : '...';
    
    // Special case: if maxLength is 0, return just the suffix (truncated if needed)
    if (maxLength === 0) {
      return suffix;
    }
    
    // Ensure the suffix doesn't make the result longer than maxLength
    const effectiveMaxLength = Math.max(0, maxLength - suffix.length);
    
    if (effectiveMaxLength <= 0) {
      // If suffix is longer than maxLength, just return the suffix truncated
      return suffix.substring(0, maxLength);
    }
    
    return value.substring(0, effectiveMaxLength) + suffix;
  }

  /**
   * Gets a nested property from an object using dot notation
   * e.g., "user.name" returns data.user.name
   */
  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Extracts attachments from JSON data if attachmentsKey is configured
   */
  private extractAttachments(jsonData: Record<string, unknown>, request: WebhookRequest): Attachment[] {
    if (!request.attachmentsKey) {
      return [];
    }

    const attachmentDataKey = request.attachmentDataKey || 'data';
    const attachmentMimeTypeKey = request.attachmentMimeTypeKey || 'mimeType';
    const attachmentFilenameKey = request.attachmentFilenameKey || 'filename';
    const attachmentDescriptionKey = request.attachmentDescriptionKey || 'description';

    const attachmentsData = this.getNestedProperty(jsonData, request.attachmentsKey);
    
    if (!Array.isArray(attachmentsData)) {
      if (attachmentsData !== undefined && attachmentsData !== null) {
        this.logger.warn(`Attachments key "${request.attachmentsKey}" exists but is not an array`);
      }
      return [];
    }

    const attachments: Attachment[] = [];
    
    for (let i = 0; i < attachmentsData.length; i++) {
      const item = attachmentsData[i];
      
      if (typeof item !== 'object' || item === null) {
        this.logger.warn(`Attachment at index ${i} is not an object`);
        continue;
      }
      
      const attachmentObj = item as Record<string, unknown>;
      
      // Validate required fields
      if (typeof attachmentObj[attachmentDataKey] !== 'string') {
        this.logger.warn(`Attachment at index ${i} missing or invalid '${attachmentDataKey}' field`);
        continue;
      }
      
      // Check for mimeType field (configurable with fallback)
      const mimeType = (typeof attachmentObj[attachmentMimeTypeKey] === 'string' ? attachmentObj[attachmentMimeTypeKey] as string : null) || 
                       (typeof attachmentObj.type === 'string' ? attachmentObj.type as string : null) ||
                       (typeof attachmentObj.mimeType === 'string' ? attachmentObj.mimeType as string : null);
      if (!mimeType) {
        this.logger.warn(`Attachment at index ${i} missing or invalid '${attachmentMimeTypeKey}' field (also checked 'type' and 'mimeType' as fallbacks)`);
        continue;
      }
      
      // Validate base64 data
      const base64Data = attachmentObj[attachmentDataKey] as string;
      if (!this.isValidBase64(base64Data)) {
        this.logger.warn(`Attachment at index ${i} has invalid base64 data in '${attachmentDataKey}' field`);
        continue;
      }
      
      const attachment: Attachment = {
        data: base64Data,
        mimeType: mimeType,
        filename: (typeof attachmentObj[attachmentFilenameKey] === 'string' ? attachmentObj[attachmentFilenameKey] as string : null) || 
                  (typeof attachmentObj.name === 'string' ? attachmentObj.name as string : null) ||
                  (typeof attachmentObj.filename === 'string' ? attachmentObj.filename as string : null) || 
                  undefined,
        description: (typeof attachmentObj[attachmentDescriptionKey] === 'string' ? attachmentObj[attachmentDescriptionKey] as string : null) || 
                     (typeof attachmentObj.alt === 'string' ? attachmentObj.alt as string : null) ||
                     (typeof attachmentObj.description === 'string' ? attachmentObj.description as string : null) || 
                     undefined,
      };
      
      attachments.push(attachment);
      this.logger.debug(`Added attachment ${i + 1}: ${attachment.mimeType}${attachment.filename ? ` (${attachment.filename})` : ''}`);
    }
    
    return attachments;
  }

  /**
   * Validates if a string is valid base64
   */
  private isValidBase64(str: string): boolean {
    try {
      // Check if string matches base64 pattern
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(str)) {
        return false;
      }
      
      // Try to decode to verify it's valid base64
      const decoded = Buffer.from(str, 'base64');
      const reencoded = decoded.toString('base64');
      
      // Check if re-encoding gives the same result (handles padding)
      return str === reencoded || str === reencoded.replace(/=+$/, '');
    } catch {
      return false;
    }
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}