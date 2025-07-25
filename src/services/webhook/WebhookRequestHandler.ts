import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { Logger } from '../../utils/logger';
import { MastodonPingBot } from '../../bot';
import type { TelemetryService } from '../telemetryInterface';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { VERSION } from '../../version';
import { WebhookValidator, WebhookRequest, ValidationError, WebhookConfig } from './WebhookValidator';
import { WebhookMessageProcessor, WebhookResponse } from './WebhookMessageProcessor';

/**
 * Handles HTTP request processing, routing, and response generation for webhook requests
 */
export class WebhookRequestHandler {
  private config: WebhookConfig;
  private bot: MastodonPingBot;
  private logger: Logger;
  private telemetry: TelemetryService;
  private validator: WebhookValidator;
  private messageProcessor: WebhookMessageProcessor;

  constructor(
    config: WebhookConfig, 
    bot: MastodonPingBot, 
    logger: Logger, 
    telemetry: TelemetryService
  ) {
    this.config = config;
    this.bot = bot;
    this.logger = logger;
    this.telemetry = telemetry;
    this.validator = new WebhookValidator(config, bot, logger);
    this.messageProcessor = new WebhookMessageProcessor(bot, logger);
  }

  /**
   * Handles incoming HTTP requests
   */
  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    return await TelemetryHelper.executeWithSpan(
      this.telemetry,
      'webhook.handle_request',
      {
        'http.method': req.method || 'unknown',
        'http.url': req.url || 'unknown',
        'http.user_agent': req.headers['user-agent'] || '',
      },
      () => this.executeHandleRequest(req, res)
    );
  }

  /**
   * Internal method to execute request handling
   */
  private async executeHandleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    
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
      const { isValidPath, webhookType, providerName } = this.validator.validateWebhookPath(url.pathname);
      if (!isValidPath) {
        this.sendErrorResponse(res, 404, 'Not found');
        return;
      }

      // Check IP whitelist
      if (!this.validator.validateClientIP(req)) {
        this.sendErrorResponse(res, 403, 'Forbidden');
        return;
      }

      // Parse request body and get raw body for HMAC validation
      const { body, rawBody } = await this.parseRequestBody(req);
      
      // Debug logging: Log incoming webhook payload 1:1
      if (this.logger.isDebugEnabled()) {
        this.logger.debug(`Incoming webhook payload for ${webhookType} webhook:`, {
          url: url.pathname,
          method: req.method,
          headers: this.validator.sanitizeHeaders(req.headers),
          body: body,
          rawBodyLength: rawBody.length,
          providerName: providerName || 'auto-detect'
        });
      }
      
      const webhookRequest = this.validator.validateWebhookRequest(body, webhookType, providerName);

      // Verify authentication (HMAC signature or simple secret)
      if (!this.validator.validateWebhookAuth(webhookRequest.provider, req, rawBody)) {
        this.logger.warn(`Webhook request with invalid authentication for provider: ${webhookRequest.provider}`);
        this.sendErrorResponse(res, 401, 'Unauthorized');
        return;
      }

      // Process webhook request
      const result = await this.messageProcessor.processWebhookRequest(webhookRequest);

      // Send success response
      this.sendSuccessResponse(res, result);

      const durationSeconds = (Date.now() - startTime) / 1000;
      this.telemetry.recordWebhookRequest(webhookRequest.provider, durationSeconds);

    } catch (error) {
      this.logger.error('Webhook request processing failed:', error);
      this.telemetry.recordError('webhook_processing_failed', 'webhook');
      
      if (error instanceof ValidationError) {
        this.sendErrorResponse(res, 400, error.message);
      } else if (error instanceof Error && error.message.includes('rate limited')) {
        // Rate limiting error - return 429 Too Many Requests
        this.sendErrorResponse(res, 429, error.message);
      } else {
        this.sendErrorResponse(res, 500, 'Internal server error');
      }
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
}