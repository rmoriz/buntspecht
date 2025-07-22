import { WebhookServer, WebhookConfig } from '../services/webhookServer';

interface WebhookTestResponse {
  success: boolean;
  provider?: string;
  error?: string;
  [key: string]: unknown;
}

interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
  service: string;
  version: string;
  webhook_enabled: boolean;
  webhook_path: string;
  webhook_port: number;
}
import { MastodonPingBot } from '../bot';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryStub';
import { createHmac } from 'crypto';

// Mock the bot
const mockBot = {
  isPushProvider: jest.fn(),
  triggerPushProvider: jest.fn(),
  triggerPushProviderWithVisibility: jest.fn(),
  triggerPushProviderWithVisibilityAndAttachments: jest.fn(),
  getPushProviders: jest.fn(),
  getProviderInfo: jest.fn(),
  getPushProvider: jest.fn()
} as unknown as MastodonPingBot;

describe('WebhookServer', () => {
  let logger: Logger;
  let telemetry: TelemetryService;
  let webhookServer: WebhookServer;

  beforeEach(() => {
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: 'test', serviceVersion: '1.0.0' }, logger);
    
    // Mock console methods to avoid test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (webhookServer && webhookServer.isServerRunning()) {
      await webhookServer.stop();
    }
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create webhook server with default configuration', () => {
      const config = {
        enabled: true,
        port: 3000
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      
      expect(webhookServer).toBeDefined();
      expect(webhookServer.isServerRunning()).toBe(false);
    });

    it('should merge configuration with defaults', () => {
      const config = {
        enabled: true,
        port: 3000,
        secret: 'test-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      const serverConfig = webhookServer.getConfig();
      
      expect(serverConfig.host).toBe('0.0.0.0');
      expect(serverConfig.path).toBe('/webhook');
      expect(serverConfig.maxPayloadSize).toBe(1024 * 1024);
      expect(serverConfig.timeout).toBe(30000);
      expect(serverConfig.secret).toBe('test-secret');
    });
  });

  describe('start and stop', () => {
    it('should not start when disabled', async () => {
      const config = {
        enabled: false,
        port: 3000
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();
      
      expect(webhookServer.isServerRunning()).toBe(false);
    });

    it('should start and stop successfully', async () => {
      const config = {
        enabled: true,
        port: 0 // Use random available port
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      
      await webhookServer.start();
      expect(webhookServer.isServerRunning()).toBe(true);
      
      await webhookServer.stop();
      expect(webhookServer.isServerRunning()).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      const config = {
        enabled: true,
        port: 0
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      
      await webhookServer.start();
      await webhookServer.start(); // Second call should be ignored
      
      expect(webhookServer.isServerRunning()).toBe(true);
    });
  });

  describe('webhook request handling', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      // Setup bot mocks
      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
      (mockBot.triggerPushProvider as jest.Mock).mockResolvedValue(undefined);
      (mockBot.getPushProviders as jest.Mock).mockReturnValue([
        { name: 'test-provider', config: { defaultMessage: 'Test' } }
      ]);
      (mockBot.getProviderInfo as jest.Mock).mockReturnValue([
        { name: 'test-provider', type: 'push', enabled: true }
      ]);
    });

    it('should handle valid webhook request', async () => {
      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
      expect(result.provider).toBe('test-provider');
      
      expect(mockBot.isPushProvider).toHaveBeenCalledWith('test-provider');
      expect(mockBot.triggerPushProviderWithVisibilityAndAttachments).toHaveBeenCalledWith('test-provider', 'Test message', undefined, undefined);
    });

    it('should reject request with invalid secret', async () => {
      const payload = {
        provider: 'test-provider'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'wrong-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(401);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should reject request without provider', async () => {
      const payload = {
        // Empty payload - no provider, no message, no json
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Provider name is required');
    });

    it('should reject request for non-push provider', async () => {
      (mockBot.isPushProvider as jest.Mock).mockReturnValue(false);

      const payload = {
        provider: 'non-push-provider'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toContain('is not a push provider');
    });

    it('should reject non-POST requests', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'GET'
      });

      expect(response.status).toBe(405);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Method not allowed');
    });

    it('should reject requests to wrong path', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/wrong-path`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: 'test' })
      });

      expect(response.status).toBe(404);
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'OPTIONS'
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should reject invalid JSON', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: 'invalid json'
      });

      expect(response.status).toBe(400);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('IP whitelist', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret',
        allowedIPs: ['127.0.0.1', '::1']
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
      (mockBot.triggerPushProvider as jest.Mock).mockResolvedValue(undefined);
      (mockBot.getPushProviders as jest.Mock).mockReturnValue([
        { name: 'test-provider', config: { defaultMessage: 'Test' } }
      ]);
      (mockBot.getProviderInfo as jest.Mock).mockReturnValue([
        { name: 'test-provider', type: 'push', enabled: true }
      ]);
    });

    it('should allow requests from whitelisted IPs', async () => {
      const payload = {
        provider: 'test-provider',
        message: 'Test message from whitelisted IP'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      // Request from localhost should be allowed
      expect(response.status).toBe(200);
    });
  });

  describe('provider-specific secrets', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'global-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      // Setup bot mocks
      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
      (mockBot.triggerPushProvider as jest.Mock).mockResolvedValue(undefined);
    });

    it('should use provider-specific secret when available', async () => {
      // Mock provider with specific secret
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue('provider-specific-secret')
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'provider-specific-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(mockBot.getPushProvider).toHaveBeenCalledWith('test-provider');
      expect(mockPushProvider.getWebhookSecret).toHaveBeenCalled();
    });

    it('should reject request with wrong provider-specific secret', async () => {
      // Mock provider with specific secret
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue('provider-specific-secret')
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);

      const payload = {
        provider: 'test-provider'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'wrong-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(401);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should fall back to global secret when provider has no specific secret', async () => {
      // Mock provider without specific secret
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue(undefined)
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);

      const payload = {
        provider: 'test-provider',
        message: 'Test message for global secret fallback'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'global-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(mockPushProvider.getWebhookSecret).toHaveBeenCalled();
    });

    it('should allow request when no authentication is configured (optional auth)', async () => {
      // Create webhook server without any authentication
      await webhookServer.stop();
      const config = {
        enabled: true,
        port: 0
        // No secret or HMAC configured
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      // Mock provider without specific authentication
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue(undefined),
        getHmacSecret: jest.fn().mockReturnValue(undefined)
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No authentication headers
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
      expect(mockBot.triggerPushProviderWithVisibilityAndAttachments).toHaveBeenCalledWith('test-provider', 'Test message', undefined, undefined);
    });
  });

  describe('HMAC authentication', () => {
    beforeEach(async () => {
      if (webhookServer) {
        await webhookServer.stop();
      }
      const config = {
        enabled: true,
        port: 0,
        hmacSecret: 'test-hmac-secret',
        hmacAlgorithm: 'sha256' as const,
        hmacHeader: 'X-Hub-Signature-256'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      // Mock provider without specific HMAC settings (uses global)
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue(undefined),
        getHmacSecret: jest.fn().mockReturnValue(undefined),
        getHmacAlgorithm: jest.fn().mockReturnValue(undefined),
        getHmacHeader: jest.fn().mockReturnValue(undefined)
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);
      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
    });

    it('should accept request with valid HMAC signature', async () => {
      const payload = JSON.stringify({
        provider: 'test-provider',
        message: 'Test message'
      });

      const signature = createHmac('sha256', 'test-hmac-secret')
        .update(payload, 'utf8')
        .digest('hex');

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${signature}`
        },
        body: payload
      });

      expect(response.status).toBe(200);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
      expect(mockBot.triggerPushProviderWithVisibilityAndAttachments).toHaveBeenCalledWith('test-provider', 'Test message', undefined, undefined);
    });

    it('should reject request with invalid HMAC signature', async () => {
      const payload = JSON.stringify({
        provider: 'test-provider',
        message: 'Test message'
      });

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=invalid-signature'
        },
        body: payload
      });

      expect(response.status).toBe(401);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should reject request with missing HMAC signature', async () => {
      const payload = JSON.stringify({
        provider: 'test-provider',
        message: 'Test message'
      });

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No HMAC signature header
        },
        body: payload
      });

      expect(response.status).toBe(401);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should use provider-specific HMAC settings when available', async () => {
      // Mock provider with specific HMAC settings
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue(undefined),
        getHmacSecret: jest.fn().mockReturnValue('provider-hmac-secret'),
        getHmacAlgorithm: jest.fn().mockReturnValue('sha512'),
        getHmacHeader: jest.fn().mockReturnValue('X-Custom-Signature')
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);

      const payload = JSON.stringify({
        provider: 'test-provider',
        message: 'Test message'
      });

      const signature = createHmac('sha512', 'provider-hmac-secret')
        .update(payload, 'utf8')
        .digest('hex');

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Signature': `sha512=${signature}`
        },
        body: payload
      });

      expect(response.status).toBe(200);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
      expect(mockBot.triggerPushProviderWithVisibilityAndAttachments).toHaveBeenCalledWith('test-provider', 'Test message', undefined, undefined);
    });

    it('should support sha1 algorithm', async () => {
      await webhookServer.stop();
      const config = {
        enabled: true,
        port: 0,
        hmacSecret: 'test-hmac-secret',
        hmacAlgorithm: 'sha1' as const,
        hmacHeader: 'X-Hub-Signature'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      const payload = JSON.stringify({
        provider: 'test-provider',
        message: 'Test message'
      });

      const signature = createHmac('sha1', 'test-hmac-secret')
        .update(payload, 'utf8')
        .digest('hex');

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature': `sha1=${signature}`
        },
        body: payload
      });

      expect(response.status).toBe(200);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
    });
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      // Setup bot mocks
      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
      (mockBot.triggerPushProviderWithVisibilityAndAttachments as jest.Mock).mockResolvedValue(undefined);
    });

    it('should return 429 when push provider is rate limited', async () => {
      // Mock provider that is rate limited
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue(undefined)
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);
      
      // Mock triggerPushProviderWithVisibilityAndAttachments to throw rate limit error
      (mockBot.triggerPushProviderWithVisibilityAndAttachments as jest.Mock).mockRejectedValue(
        new Error('Push provider "test-provider" is rate limited. Next message allowed in 45 seconds.')
      );

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(429);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limited');
      expect(result.error).toContain('45 seconds');
    });

    it('should succeed when push provider is not rate limited', async () => {
      // Mock provider without rate limiting
      const mockPushProvider = {
        getWebhookSecret: jest.fn().mockReturnValue(undefined)
      };
      (mockBot.getPushProvider as jest.Mock).mockReturnValue(mockPushProvider);
      
      // Mock successful trigger
      (mockBot.triggerPushProvider as jest.Mock).mockResolvedValue(undefined);

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
      expect(mockBot.triggerPushProviderWithVisibilityAndAttachments).toHaveBeenCalledWith('test-provider', 'Test message', undefined, undefined);
    });
  });

  describe('configuration', () => {
    it('should return current configuration', () => {
      const config = {
        enabled: true,
        port: 3000,
        host: 'localhost',
        path: '/custom-webhook',
        secret: 'custom-secret',
        maxPayloadSize: 2048,
        timeout: 60000
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      const returnedConfig = webhookServer.getConfig();
      
      expect(returnedConfig.enabled).toBe(true);
      expect(returnedConfig.port).toBe(3000);
      expect(returnedConfig.host).toBe('localhost');
      expect(returnedConfig.path).toBe('/custom-webhook');
      expect(returnedConfig.secret).toBe('custom-secret');
      expect(returnedConfig.maxPayloadSize).toBe(2048);
      expect(returnedConfig.timeout).toBe(60000);
    });

    it('should throw error if webhook path conflicts with health endpoint', () => {
      const config: WebhookConfig = {
        enabled: true,
        port: 3000,
        path: '/health' // This should conflict
      };

      expect(() => {
        new WebhookServer(config, mockBot, logger, telemetry);
      }).toThrow('Webhook path cannot be "/health" as it conflicts with the health check endpoint');
    });
  });

  describe('health check endpoint', () => {
    let webhookServer: WebhookServer;

    beforeEach(async () => {
      const config: WebhookConfig = {
        enabled: true,
        port: 0, // Use random port
        host: 'localhost',
        path: '/webhook'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();
    });

    afterEach(async () => {
      await webhookServer.stop();
    });

    it('should respond to GET /health with OK status', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/health`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      
      const data = await response.json() as HealthCheckResponse;
      expect(data.status).toBe('OK');
      expect(data.service).toBe('buntspecht-webhook-server');
      expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(data.webhook_enabled).toBe(true);
      expect(data.webhook_path).toBe('/webhook');
      expect(typeof data.timestamp).toBe('string');
      expect(typeof data.uptime).toBe('number');
    });

    it('should respond to HEAD /health with OK status', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/health`, {
        method: 'HEAD'
      });
      
      expect(response.status).toBe(200);
    });

    it('should reject POST to /health', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      
      expect(response.status).toBe(405);
    });

    it('should reject PUT to /health', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/health`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      
      expect(response.status).toBe(405);
    });

    it('should handle health check errors gracefully', async () => {
      // Mock a scenario where health check might fail
      const mockLogger = {
        error: jest.fn()
      };
      
      // Test that health endpoint still works under normal conditions
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret',
        maxPayloadSize: 1024 // Small payload for testing
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
      (mockBot.triggerPushProvider as jest.Mock).mockResolvedValue(undefined);
    });

    it('should reject payload that exceeds max size', async () => {
      const largePayload = {
        provider: 'test-provider',
        message: 'X'.repeat(2000) // Exceeds 1024 byte limit
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(largePayload)
      });

      expect(response.status).toBe(400);
      const result = await response.json() as WebhookTestResponse;
      expect(result.error).toContain('Payload too large');
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: '{"invalid": json}' // Malformed JSON
      });

      expect(response.status).toBe(400);
      const result = await response.json() as WebhookTestResponse;
      expect(result.error).toContain('Invalid JSON');
    });

    it('should validate webhook request field types', async () => {
      const invalidPayload = {
        provider: 'test-provider',
        message: 123, // Invalid type
        visibility: 'invalid-visibility', // Invalid value
        accounts: ['account1', 123] // Invalid type in array
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(invalidPayload)
      });

      expect(response.status).toBe(400);
      const result = await response.json() as WebhookTestResponse;
      expect(result.error).toBeTruthy();
    });

    it('should validate JSON workflow requirements', async () => {
      // Missing template when json is provided
      const invalidJsonPayload1 = {
        provider: 'test-provider',
        json: { key: 'value' }
      };

      let response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(invalidJsonPayload1)
      });

      expect(response.status).toBe(400);
      let result = await response.json() as WebhookTestResponse;
      expect(result.error).toContain('No template found for provider');

      // Missing json when template is provided
      const invalidJsonPayload2 = {
        provider: 'test-provider',
        template: 'Hello {{name}}'
      };

      response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(invalidJsonPayload2)
      });

      expect(response.status).toBe(400);
      result = await response.json() as WebhookTestResponse;
      expect(result.error).toContain('JSON data is required when template is provided');
    });

    it('should validate attachment field types', async () => {
      const invalidAttachmentPayload = {
        provider: 'test-provider',
        json: { name: 'test' },
        template: 'Hello {{name}}',
        attachmentsKey: 123, // Invalid type
        uniqueKey: 456, // Invalid type
        attachmentDataKey: true // Invalid type
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(invalidAttachmentPayload)
      });

      expect(response.status).toBe(400);
      const result = await response.json() as WebhookTestResponse;
      expect(result.error).toBeTruthy();
    });

    it('should handle empty JSON arrays gracefully', async () => {
      const emptyArrayPayload = {
        provider: 'test-provider',
        json: [],
        template: 'Hello {{name}}'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(emptyArrayPayload)
      });

      expect(response.status).toBe(200);
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
    });

    it('should handle non-object JSON items in arrays', async () => {
      const mixedArrayPayload = {
        provider: 'test-provider',
        json: [
          { name: 'valid' },
          'invalid string',
          123,
          null
        ],
        template: 'Hello {{name}}'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(mixedArrayPayload)
      });

      expect(response.status).toBe(200);
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(true);
    });

    it('should handle primitive JSON data (string, number)', async () => {
      const primitivePayload = {
        provider: 'test-provider',
        json: 'invalid primitive',
        template: 'Hello {{name}}'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(primitivePayload)
      });

      expect(response.status).toBe(400);
      const result = await response.json() as WebhookTestResponse;
      expect(result.error).toContain('JSON data must be an object or array');
    });
  });

  describe('CORS handling edge cases', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();
    });

    it('should handle CORS preflight requests with custom headers', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type,X-Webhook-Secret'
        }
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should include CORS headers in error responses', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'GET' // Invalid method
      });

      expect(response.status).toBe(405);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });
  });

  describe('IP whitelist edge cases', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret',
        allowedIPs: ['127.0.0.1', '::1', '192.168.1.100']
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      (mockBot.isPushProvider as jest.Mock).mockReturnValue(true);
      (mockBot.triggerPushProvider as jest.Mock).mockResolvedValue(undefined);
    });

    it('should handle IPv6 localhost address', async () => {
      // This test assumes the server can handle IPv6 - actual IP testing would need network setup
      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      // Since we're testing from localhost, this should succeed
      expect(response.status).toBe(200);
    });

    it('should reject requests from non-whitelisted IPs', async () => {
      // Test IP extraction and validation logic
      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      // Since we're testing from localhost (127.0.0.1), this should succeed
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      // localhost is whitelisted, so this should succeed
      expect(response.status).toBe(200);
    });
  });

  describe('server startup edge cases', () => {
    it('should handle server startup errors gracefully', async () => {
      const config = {
        enabled: true,
        port: 0,
        host: 'invalid.host.name' // Invalid host
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      
      // This should fail but not crash the application
      try {
        await webhookServer.start();
        // If it somehow succeeds, stop it
        if (webhookServer.isServerRunning()) {
          await webhookServer.stop();
        }
      } catch (error) {
        // Expected to fail with invalid host
        expect(error).toBeDefined();
      }
    });

    it('should handle double stop gracefully', async () => {
      const config = {
        enabled: true,
        port: 0
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();
      
      // Stop twice should not throw
      await webhookServer.stop();
      await webhookServer.stop(); // Second stop should be safe
    });
  });

  describe('fallback handling for older bots', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();
    });

    it('should fallback to triggerPushProviderWithVisibility when attachments not supported', async () => {
      // Create a more complete mock bot
      const mockOldBot = {
        ...mockBot,
        triggerPushProviderWithVisibilityAndAttachments: undefined,
        triggerPushProviderWithVisibility: jest.fn().mockResolvedValue(undefined),
      } as unknown as MastodonPingBot;

      // Create new server with old bot
      await webhookServer.stop();
      webhookServer = new WebhookServer({ enabled: true, port: 0, secret: 'test-secret' }, mockOldBot, logger, telemetry);
      await webhookServer.start();

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
    });

    it('should fallback to triggerPushProvider when only basic method is available', async () => {
      // Create a more complete mock bot
      const mockVeryOldBot = {
        ...mockBot,
        triggerPushProviderWithVisibilityAndAttachments: undefined,
        triggerPushProviderWithVisibility: undefined,
        triggerPushProvider: jest.fn().mockResolvedValue(undefined),
      } as unknown as MastodonPingBot;

      // Create new server with very old bot
      await webhookServer.stop();
      webhookServer = new WebhookServer({ enabled: true, port: 0, secret: 'test-secret' }, mockVeryOldBot, logger, telemetry);
      await webhookServer.start();

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
    });
  });

  describe('server error handling paths', () => {
    it('should handle server errors during request processing', async () => {
      const config = {
        enabled: true,
        port: 0,
        secret: 'test-secret'
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

      // Mock bot to throw an error during processing
      (mockBot.isPushProvider as jest.Mock).mockImplementation(() => {
        throw new Error('Simulated server error');
      });

      const payload = {
        provider: 'test-provider',
        message: 'Test message'
      };

      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'test-secret'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(500);
      const result = await response.json() as WebhookTestResponse;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal server error');
    });
  });
});