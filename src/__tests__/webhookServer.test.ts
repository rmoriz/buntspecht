import { WebhookServer } from '../services/webhookServer';
import { MastodonPingBot } from '../bot';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryStub';

// Mock the bot
const mockBot = {
  isPushProvider: jest.fn(),
  triggerPushProvider: jest.fn(),
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
      
      const result = await response.json() as any;
      expect(result.success).toBe(true);
      expect(result.provider).toBe('test-provider');
      
      expect(mockBot.isPushProvider).toHaveBeenCalledWith('test-provider');
      expect(mockBot.triggerPushProvider).toHaveBeenCalledWith('test-provider', 'Test message');
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
      
      const result = await response.json() as any;
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
      
      const result = await response.json() as any;
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
      
      const result = await response.json() as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain('is not a push provider');
    });

    it('should reject non-POST requests', async () => {
      const response = await fetch(`http://localhost:${webhookServer.getConfig().port}/webhook`, {
        method: 'GET'
      });

      expect(response.status).toBe(405);
      
      const result = await response.json() as any;
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
      
      const result = await response.json() as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });
  });

  describe('IP whitelist', () => {
    beforeEach(async () => {
      const config = {
        enabled: true,
        port: 0,
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
          'Content-Type': 'application/json'
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
      
      const result = await response.json() as any;
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

    it('should allow request when no secrets are configured', async () => {
      // Create webhook server without global secret
      await webhookServer.stop();
      const config = {
        enabled: true,
        port: 0
        // No secret configured
      };

      webhookServer = new WebhookServer(config, mockBot, logger, telemetry);
      await webhookServer.start();

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
          'Content-Type': 'application/json'
          // No secret header
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
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