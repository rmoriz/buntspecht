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
      expect(provider.getConfig()).toEqual(config);
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

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const provider = new PushProvider();
      await expect(provider.initialize(logger)).resolves.toBeUndefined();
    });
  });
});