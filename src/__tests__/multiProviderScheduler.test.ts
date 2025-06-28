import { MultiProviderScheduler } from '../services/multiProviderScheduler';
import { MastodonClient } from '../services/mastodonClient';
import { BotConfig, ProviderConfig } from '../types/config';
import { Logger } from '../utils/logger';

// Mock the MastodonClient
jest.mock('../services/mastodonClient');

describe('MultiProviderScheduler', () => {
  let scheduler: MultiProviderScheduler;
  let mockMastodonClient: jest.Mocked<MastodonClient>;
  let logger: Logger;
  let config: BotConfig;

  beforeEach(() => {
    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();

    mockMastodonClient = new MastodonClient({} as BotConfig, logger) as jest.Mocked<MastodonClient>;
    mockMastodonClient.postStatus = jest.fn().mockResolvedValue(undefined);
    mockMastodonClient.hasAccount = jest.fn().mockReturnValue(true);

    config = {
      accounts: [
        {
          name: 'test-account',
          instance: 'https://test.social',
          accessToken: 'test-token'
        }
      ],
      bot: {
        providers: []
      },
      logging: {
        level: 'info'
      }
    };

    scheduler = new MultiProviderScheduler(mockMastodonClient, config, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    scheduler.stop();
  });

  describe('initialization', () => {
    it('should throw error when no providers are configured', async () => {
      await expect(scheduler.initialize()).rejects.toThrow('No providers configured');
    });

    it('should initialize single provider successfully', async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'test-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Test message' }
        }
      ];
      config.bot.providers = providers;

      await scheduler.initialize();

      expect(logger.info).toHaveBeenCalledWith('Initializing 1 provider(s)...');
      expect(logger.info).toHaveBeenCalledWith('Successfully initialized 1 provider(s)');
    });

    it('should initialize multiple providers successfully', async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'ping-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Ping message' }
        },
        {
          name: 'command-provider',
          type: 'command',
          cronSchedule: '*/30 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { command: 'echo "test"' }
        }
      ];
      config.bot.providers = providers;

      await scheduler.initialize();

      expect(logger.info).toHaveBeenCalledWith('Initializing 2 provider(s)...');
      expect(logger.info).toHaveBeenCalledWith('Successfully initialized 2 provider(s)');
    });

    it('should skip disabled providers', async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'enabled-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Enabled message' }
        },
        {
          name: 'disabled-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: false,
          accounts: ['test-account'],
          config: { message: 'Disabled message' }
        }
      ];
      config.bot.providers = providers;

      await scheduler.initialize();

      expect(logger.info).toHaveBeenCalledWith('Skipping disabled provider: disabled-provider');
      expect(logger.info).toHaveBeenCalledWith('Successfully initialized 1 provider(s)');
    });

    it('should handle invalid cron schedule', async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'invalid-cron',
          type: 'ping',
          cronSchedule: 'invalid-cron',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Test message' }
        }
      ];
      config.bot.providers = providers;

      await expect(scheduler.initialize()).rejects.toThrow('Invalid cron schedule for provider "invalid-cron"');
    });
  });


  describe('provider execution', () => {
    beforeEach(async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'test-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Test message' }
        }
      ];
      config.bot.providers = providers;
      await scheduler.initialize();
    });

    it('should execute all tasks immediately', async () => {
      await scheduler.executeAllTasksNow();

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('Test message', ['test-account']);
      expect(logger.info).toHaveBeenCalledWith('Successfully posted message from provider: test-provider');
    });

    it('should execute specific provider task', async () => {
      await scheduler.executeProviderTaskNow('test-provider');

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('Test message', ['test-account']);
      expect(logger.info).toHaveBeenCalledWith('Successfully posted message from provider: test-provider');
    });

    it('should throw error for non-existent provider', async () => {
      await expect(scheduler.executeProviderTaskNow('non-existent')).rejects.toThrow('Provider "non-existent" not found');
    });

    it('should handle provider execution errors gracefully', async () => {
      mockMastodonClient.postStatus.mockRejectedValue(new Error('Posting failed'));

      await scheduler.executeAllTasksNow();

      expect(logger.error).toHaveBeenCalledWith('Failed to execute task for provider "test-provider":', expect.any(Error));
    });
  });

  describe('scheduler lifecycle', () => {
    beforeEach(async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'test-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Test message' }
        }
      ];
      config.bot.providers = providers;
    });

    it('should start and stop scheduler', async () => {
      await scheduler.start();
      expect(scheduler.isSchedulerRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isSchedulerRunning()).toBe(false);
    });

    it('should warn when starting already running scheduler', async () => {
      await scheduler.start();
      await scheduler.start();

      expect(logger.warn).toHaveBeenCalledWith('Multi-provider scheduler is already running');
    });

    it('should warn when stopping non-running scheduler', () => {
      scheduler.stop();

      expect(logger.warn).toHaveBeenCalledWith('Multi-provider scheduler is not running');
    });
  });

  describe('provider information', () => {
    it('should return provider information', async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'ping-provider',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Ping' }
        },
        {
          name: 'command-provider',
          type: 'command',
          cronSchedule: '*/30 * * * *',
          enabled: false,
          accounts: ['test-account'],
          config: { command: 'echo test' }
        }
      ];
      config.bot.providers = providers;
      await scheduler.initialize();

      const info = scheduler.getProviderInfo();

      expect(info).toHaveLength(1); // Only enabled provider
      expect(info[0]).toEqual({
        name: 'ping-provider',
        type: 'ping',
        schedule: '0 * * * *',
        enabled: true
      });
    });

    it('should return provider names', async () => {
      const providers: ProviderConfig[] = [
        {
          name: 'provider-1',
          type: 'ping',
          cronSchedule: '0 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Test 1' }
        },
        {
          name: 'provider-2',
          type: 'ping',
          cronSchedule: '*/30 * * * *',
          enabled: true,
          accounts: ['test-account'],
          config: { message: 'Test 2' }
        }
      ];
      config.bot.providers = providers;
      await scheduler.initialize();

      const names = scheduler.getProviderNames();

      expect(names).toEqual(['provider-1', 'provider-2']);
    });
  });
});