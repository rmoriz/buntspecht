import { MultiProviderScheduler } from '../services/multiProviderScheduler';
import { MastodonClient } from '../services/mastodonClient';
import type { TelemetryService } from '../services/telemetryInterface';
import { BotConfig, ProviderConfig } from '../types/config';
import { Logger } from '../utils/logger';

// Mock the MastodonClient
jest.mock('../services/mastodonClient');

describe('MultiProviderScheduler', () => {
  let scheduler: MultiProviderScheduler;
  let mockMastodonClient: jest.Mocked<MastodonClient>;
  let mockTelemetry: jest.Mocked<TelemetryService>;
  let logger: Logger;
  let config: BotConfig;

  beforeEach(() => {
    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();

    // Create mock telemetry service
    mockTelemetry = {
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
      startSpan: jest.fn().mockReturnValue({
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      }),
      recordPost: jest.fn(),
      recordError: jest.fn(),
      recordProviderExecution: jest.fn(),
      updateActiveConnections: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(false),
      getTracer: jest.fn(),
      getMeter: jest.fn(),
    } as unknown as jest.Mocked<TelemetryService>;

    mockMastodonClient = new MastodonClient({} as BotConfig, logger, mockTelemetry) as jest.Mocked<MastodonClient>;
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

    scheduler = new MultiProviderScheduler(mockMastodonClient, config, logger, mockTelemetry);
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

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('Test message', ['test-account'], 'test-provider', undefined);
      expect(logger.info).toHaveBeenCalledWith('Successfully posted message from provider: test-provider');
    });

    it('should execute specific provider task', async () => {
      await scheduler.executeProviderTaskNow('test-provider');

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('Test message', ['test-account'], 'test-provider', undefined);
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

    it('should skip posting when provider generates empty message', async () => {
      // Create a mock provider that returns empty message
      const mockProvider = {
        generateMessage: jest.fn().mockResolvedValue(''),
        getProviderName: jest.fn().mockReturnValue('test-provider'),
        initialize: jest.fn().mockResolvedValue(undefined)
      };

      // Replace the provider in the scheduler's internal scheduledProviders array
      const scheduledProviders = (scheduler as any).scheduledProviders;
      const existingProvider = scheduledProviders.find((p: any) => p.name === 'test-provider');
      if (existingProvider) {
        existingProvider.provider = mockProvider;
      }

      await scheduler.executeProviderTaskNow('test-provider');

      expect(mockProvider.generateMessage).toHaveBeenCalled();
      expect(mockMastodonClient.postStatus).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Provider "test-provider" generated empty message, skipping post');
    });

    it('should skip posting when provider generates whitespace-only message', async () => {
      // Create a mock provider that returns whitespace-only message
      const mockProvider = {
        generateMessage: jest.fn().mockResolvedValue('   \n\t  '),
        getProviderName: jest.fn().mockReturnValue('test-provider'),
        initialize: jest.fn().mockResolvedValue(undefined)
      };

      // Replace the provider in the scheduler's internal scheduledProviders array
      const scheduledProviders = (scheduler as any).scheduledProviders;
      const existingProvider = scheduledProviders.find((p: any) => p.name === 'test-provider');
      if (existingProvider) {
        existingProvider.provider = mockProvider;
      }

      await scheduler.executeProviderTaskNow('test-provider');

      expect(mockProvider.generateMessage).toHaveBeenCalled();
      expect(mockMastodonClient.postStatus).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Provider "test-provider" generated empty message, skipping post');
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