import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { Logger } from '../utils/logger';
import { MastodonPingBot } from '../bot';
import type { TelemetryService } from './telemetryInterface';

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
  metadata?: Record<string, unknown>;
}

export interface WebhookResponse {
  success: boolean;
  message: string;
  timestamp: string;
  provider?: string;
  accounts?: string[];
}

export class WebhookServer {
  private server: any;
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

    this.server.timeout = this.config.timeout;

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        // Update config with actual assigned port (important for port: 0)
        const address = this.server.address();
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
      this.server.close(() => {
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
  private async parseRequestBody(req: IncomingMessage): Promise<any> {
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
        } catch (error) {
          reject(new ValidationError('Invalid JSON payload'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Validates the webhook request
   */
  private validateWebhookRequest(body: any): WebhookRequest {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be a JSON object');
    }

    if (!body.provider || typeof body.provider !== 'string') {
      throw new ValidationError('Provider name is required and must be a string');
    }

    if (body.message && typeof body.message !== 'string') {
      throw new ValidationError('Message must be a string');
    }

    if (body.accounts && !Array.isArray(body.accounts)) {
      throw new ValidationError('Accounts must be an array');
    }

    if (body.accounts && body.accounts.some((acc: any) => typeof acc !== 'string')) {
      throw new ValidationError('All account names must be strings');
    }

    return {
      provider: body.provider,
      message: body.message,
      accounts: body.accounts,
      metadata: body.metadata || {}
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

    // Trigger the push provider
    await this.bot.triggerPushProvider(request.provider, request.message);

    const response: WebhookResponse = {
      success: true,
      message: `Successfully triggered push provider "${request.provider}"`,
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

    this.logger.info(`Webhook processed successfully for provider: ${request.provider}`);
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
    return req.socket.remoteAddress || 'unknown';
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
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}