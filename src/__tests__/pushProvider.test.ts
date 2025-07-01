import { PushProvider, PushProviderConfig } from '../messages/pushProvider';
import { Logger } from '../utils/logger';

describe('PushProvider', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('debug');
    // Mock console methods to avoid test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new PushProvider();
      expect(provider.getProviderName()).toBe('push');
      expect(provider.hasMessage()).toBe(true); // Should have default message
    });

    it('should create provider with custom configuration', () => {
      const config: PushProviderConfig = {
        defaultMessage: 'Custom default message',
        allowExternalMessages: false,
        maxMessageLength: 100
      };
      const provider = new PushProvider(config);
      expect(provider.getProviderName()).toBe('push');
      
      const returnedConfig = provider.getConfig();
      expect(returnedConfig.defaultMessage).toBe(config.defaultMessage);
      expect(returnedConfig.allowExternalMessages).toBe(config.allowExternalMessages);
      expect(returnedConfig.maxMessageLength).toBe(config.maxMessageLength);
      expect(returnedConfig.rateLimitMessages).toBe(1); // Default value
      expect(returnedConfig.rateLimitWindowSeconds).toBe(60); // Default value
    });

    it('should create provider with webhook secret', () => {
      const config: PushProviderConfig = {
        defaultMessage: 'Test message',
        webhookSecret: 'test-secret-123'
      };
      const provider = new PushProvider(config);
      expect(provider.getWebhookSecret()).toBe('test-secret-123');
      expect(provider.getConfig().webhookSecret).toBe('test-secret-123');
    });
  });

  describe('generateMessage', () => {
    it('should return default message when no custom message is set', async () => {
      const provider = new PushProvider({ defaultMessage: 'Test default' });
      await provider.initialize(logger);
      
      const message = await provider.generateMessage();
      expect(message).toBe('Test default');
    });

    it('should return custom message when set', async () => {
      const provider = new PushProvider();
      await provider.initialize(logger);
      
      provider.setMessage('Custom message');
      const message = await provider.generateMessage();
      expect(message).toBe('Custom message');
    });

    it('should clear custom message after generating', async () => {
      const provider = new PushProvider({ defaultMessage: 'Default' });
      await provider.initialize(logger);
      
      provider.setMessage('Custom');
      await provider.generateMessage(); // Should use custom message
      const secondMessage = await provider.generateMessage(); // Should use default
      expect(secondMessage).toBe('Default');
    });
  });

  describe('setMessage', () => {
    it('should set custom message when external messages are allowed', async () => {
      const provider = new PushProvider({ allowExternalMessages: true });
      await provider.initialize(logger);
      
      provider.setMessage('Test message');
      const message = await provider.generateMessage();
      expect(message).toBe('Test message');
    });

    it('should ignore custom message when external messages are not allowed', async () => {
      const provider = new PushProvider({ 
        defaultMessage: 'Default',
        allowExternalMessages: false 
      });
      await provider.initialize(logger);
      
      provider.setMessage('Should be ignored');
      const message = await provider.generateMessage();
      expect(message).toBe('Default');
    });

    it('should truncate long messages', async () => {
      const provider = new PushProvider({ maxMessageLength: 10 });
      await provider.initialize(logger);
      
      provider.setMessage('This is a very long message that should be truncated');
      const message = await provider.generateMessage();
      expect(message).toBe('This is...');
      expect(message.length).toBe(10);
    });
  });

  describe('hasMessage', () => {
    it('should return true when default message exists', () => {
      const provider = new PushProvider({ defaultMessage: 'Test' });
      expect(provider.hasMessage()).toBe(true);
    });

    it('should return true when custom message is set', async () => {
      const provider = new PushProvider();
      await provider.initialize(logger);
      
      provider.setMessage('Custom');
      expect(provider.hasMessage()).toBe(true);
    });
  });

  describe('clearMessage', () => {
    it('should clear custom message', async () => {
      const provider = new PushProvider({ defaultMessage: 'Default' });
      await provider.initialize(logger);
      
      provider.setMessage('Custom');
      provider.clearMessage();
      const message = await provider.generateMessage();
      expect(message).toBe('Default');
    });
  });

  describe('getWebhookSecret', () => {
    it('should return undefined when no webhook secret is configured', () => {
      const provider = new PushProvider();
      expect(provider.getWebhookSecret()).toBeUndefined();
    });

    it('should return webhook secret when configured', () => {
      const provider = new PushProvider({ webhookSecret: 'my-secret' });
      expect(provider.getWebhookSecret()).toBe('my-secret');
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      // Mock Date.now to control time
      jest.spyOn(Date, 'now');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should use default rate limiting configuration', () => {
      const provider = new PushProvider();
      const config = provider.getConfig();
      expect(config.rateLimitMessages).toBe(1);
      expect(config.rateLimitWindowSeconds).toBe(60);
    });

    it('should use custom rate limiting configuration', () => {
      const provider = new PushProvider({
        rateLimitMessages: 5,
        rateLimitWindowSeconds: 300
      });
      const config = provider.getConfig();
      expect(config.rateLimitMessages).toBe(5);
      expect(config.rateLimitWindowSeconds).toBe(300);
    });

    it('should not be rate limited initially', () => {
      const provider = new PushProvider();
      expect(provider.isRateLimited()).toBe(false);
      expect(provider.getTimeUntilNextMessage()).toBe(0);
    });

    it('should become rate limited after reaching limit', () => {
      const mockNow = 1000000;
      (Date.now as jest.Mock).mockReturnValue(mockNow);

      const provider = new PushProvider({ rateLimitMessages: 2, rateLimitWindowSeconds: 60 });
      
      // Send first message
      provider.recordMessageSent();
      expect(provider.isRateLimited()).toBe(false);
      
      // Send second message
      provider.recordMessageSent();
      expect(provider.isRateLimited()).toBe(true);
      expect(provider.getTimeUntilNextMessage()).toBeGreaterThan(0);
    });

    it('should reset rate limit after time window', () => {
      const mockNow = 1000000;
      (Date.now as jest.Mock).mockReturnValue(mockNow);

      const provider = new PushProvider({ rateLimitMessages: 1, rateLimitWindowSeconds: 60 });
      
      // Send message to hit rate limit
      provider.recordMessageSent();
      expect(provider.isRateLimited()).toBe(true);
      
      // Move time forward beyond window
      (Date.now as jest.Mock).mockReturnValue(mockNow + 61000);
      expect(provider.isRateLimited()).toBe(false);
      expect(provider.getTimeUntilNextMessage()).toBe(0);
    });

    it('should provide accurate rate limit information', () => {
      const mockNow = 1000000;
      (Date.now as jest.Mock).mockReturnValue(mockNow);

      const provider = new PushProvider({ rateLimitMessages: 3, rateLimitWindowSeconds: 120 });
      
      // Initial state
      let info = provider.getRateLimitInfo();
      expect(info.messages).toBe(3);
      expect(info.windowSeconds).toBe(120);
      expect(info.currentCount).toBe(0);
      expect(info.timeUntilReset).toBe(0);
      
      // After sending one message
      provider.recordMessageSent();
      info = provider.getRateLimitInfo();
      expect(info.currentCount).toBe(1);
      expect(info.timeUntilReset).toBe(0);
      
      // After hitting rate limit
      provider.recordMessageSent();
      provider.recordMessageSent();
      info = provider.getRateLimitInfo();
      expect(info.currentCount).toBe(3);
      expect(info.timeUntilReset).toBeGreaterThan(0);
    });

    it('should calculate time until next message correctly', () => {
      const mockNow = 1000000;
      (Date.now as jest.Mock).mockReturnValue(mockNow);

      const provider = new PushProvider({ rateLimitMessages: 1, rateLimitWindowSeconds: 60 });
      
      // Send message to hit rate limit
      provider.recordMessageSent();
      expect(provider.isRateLimited()).toBe(true);
      
      // Move time forward 30 seconds
      (Date.now as jest.Mock).mockReturnValue(mockNow + 30000);
      expect(provider.getTimeUntilNextMessage()).toBe(30);
      
      // Move time forward 50 seconds
      (Date.now as jest.Mock).mockReturnValue(mockNow + 50000);
      expect(provider.getTimeUntilNextMessage()).toBe(10);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const provider = new PushProvider();
      await expect(provider.initialize(logger)).resolves.toBeUndefined();
    });
  });
});