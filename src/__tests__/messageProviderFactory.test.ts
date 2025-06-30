import { MessageProviderFactory } from '../messages/messageProviderFactory';
import { PingProvider } from '../messages/pingProvider';
import { CommandProvider } from '../messages/commandProvider';
import { JsonCommandProvider } from '../messages/jsonCommandProvider';
import { PushProvider } from '../messages/pushProvider';
import { Logger } from '../utils/logger';

describe('MessageProviderFactory', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createProvider', () => {
    it('should create ping provider', async () => {
      const provider = await MessageProviderFactory.createProvider(
        'ping',
        { message: 'Test ping' },
        logger
      );

      expect(provider).toBeInstanceOf(PingProvider);
      expect(provider.getProviderName()).toBe('ping');
    });

    it('should create command provider', async () => {
      const provider = await MessageProviderFactory.createProvider(
        'command',
        { command: 'echo "test"' },
        logger
      );

      expect(provider).toBeInstanceOf(CommandProvider);
      expect(provider.getProviderName()).toBe('command');
    });

    it('should create jsoncommand provider', async () => {
      const provider = await MessageProviderFactory.createProvider(
        'jsoncommand',
        { command: 'echo \'{"test": "value"}\'', template: 'Test: {{test}}' },
        logger
      );

      expect(provider).toBeInstanceOf(JsonCommandProvider);
      expect(provider.getProviderName()).toBe('jsoncommand');
    });

    it('should create push provider', async () => {
      const provider = await MessageProviderFactory.createProvider(
        'push',
        { defaultMessage: 'Test push', allowExternalMessages: true },
        logger
      );

      expect(provider).toBeInstanceOf(PushProvider);
      expect(provider.getProviderName()).toBe('push');
    });

    it('should handle case insensitive provider types', async () => {
      const provider = await MessageProviderFactory.createProvider(
        'COMMAND',
        { command: 'echo "test"' },
        logger
      );

      expect(provider).toBeInstanceOf(CommandProvider);
      expect(provider.getProviderName()).toBe('command');
    });

    it('should fall back to ping provider for unknown types', async () => {
      const provider = await MessageProviderFactory.createProvider(
        'unknown',
        { message: 'fallback' },
        logger
      );

      expect(provider).toBeInstanceOf(PingProvider);
      expect(provider.getProviderName()).toBe('ping');
      expect(logger.warn).toHaveBeenCalledWith('Unknown message provider type: unknown, falling back to ping');
    });

    it('should initialize provider if it has initialize method', async () => {
      await MessageProviderFactory.createProvider(
        'ping',
        { message: 'Test ping' },
        logger
      );

      expect(logger.info).toHaveBeenCalledWith('Created message provider: ping');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of available providers', () => {
      const providers = MessageProviderFactory.getAvailableProviders();
      expect(providers).toEqual(['ping', 'command', 'jsoncommand', 'push']);
    });
  });
});