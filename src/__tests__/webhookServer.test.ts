import { WebhookServer } from '../services/webhookServer';

interface WebhookTestResponse {
  success: boolean;
  provider?: string;
  error?: string;
  [key: string]: unknown;
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
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
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
        provider: 'test-provider'
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
        provider: 'test-provider'
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
  });
});