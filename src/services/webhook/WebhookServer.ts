import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Logger } from '../../utils/logger';
import { MastodonPingBot } from '../../bot';
import type { TelemetryService } from '../telemetryInterface';
import { BaseConfigurableService } from '../baseService';
import { WebhookRequestHandler } from './WebhookRequestHandler';
import { WebhookRateLimiter, RateLimitConfig } from './WebhookRateLimiter';
import { WebhookConfig } from './WebhookValidator';

export { WebhookConfig, WebhookRequest } from './WebhookValidator';
export { WebhookResponse } from './WebhookMessageProcessor';

/**
 * Main webhook server orchestrator that manages the HTTP server lifecycle
 * and coordinates between different webhook components
 */
export class WebhookServer extends BaseConfigurableService<WebhookConfig> {
  private server: ReturnType<typeof createServer> | null = null;
  private bot: MastodonPingBot;
  private requestHandler: WebhookRequestHandler;
  private rateLimiter?: WebhookRateLimiter;
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
    this.requestHandler = new WebhookRequestHandler(configWithDefaults, bot, logger, telemetry);

    // Initialize rate limiter if configured
    // Note: Rate limiting configuration would need to be added to WebhookConfig
    // For now, we'll create a disabled rate limiter
    const rateLimitConfig: RateLimitConfig = {
      enabled: false,
      windowMs: 60000, // 1 minute
      maxRequests: 100 // 100 requests per minute
    };
    this.rateLimiter = new WebhookRateLimiter(rateLimitConfig, logger);
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
          
          // Clean up rate limiter
          if (this.rateLimiter) {
            this.rateLimiter.destroy();
          }
          
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
   * Handles incoming HTTP requests with rate limiting
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Check rate limit
    if (this.rateLimiter && !this.rateLimiter.checkRateLimit(req)) {
      const rateLimitInfo = this.rateLimiter.getRateLimitInfo(req);
      res.setHeader('X-RateLimit-Limit', '100'); // This should come from config
      res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitInfo.resetTime / 1000).toString());
      this.sendErrorResponse(res, 429, 'Too Many Requests');
      return;
    }

    let success = false;
    try {
      await this.requestHandler.handleRequest(req, res);
      success = true;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      // Record the request result for rate limiting
      if (this.rateLimiter) {
        this.rateLimiter.recordRequest(req, success);
      }
    }
  }

  /**
   * Sends an error response (fallback for server-level errors)
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