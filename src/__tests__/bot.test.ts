import { MastodonPingBot } from '../bot';
import { ConfigLoader } from '../config/configLoader';
import { SocialMediaClient } from '../services/socialMediaClient';
import { MultiProviderScheduler } from '../services/multiProviderScheduler';
import type { TelemetryService } from '../services/telemetryInterface';
import { Logger } from '../utils/logger';
import { CliOptions, BotConfig } from '../types/config';
import * as packageJson from '../../package.json';

// Mock all dependencies
jest.mock('../config/configLoader');
jest.mock('../services/socialMediaClient');
jest.mock('../services/multiProviderScheduler');
jest.mock('../services/telemetry');
jest.mock('../services/telemetryFactory');
jest.mock('../utils/logger');

const MockConfigLoader = ConfigLoader as jest.MockedClass<typeof ConfigLoader>;
const MockSocialMediaClient = SocialMediaClient as jest.MockedClass<typeof SocialMediaClient>;
const MockMultiProviderScheduler = MultiProviderScheduler as jest.MockedClass<typeof MultiProviderScheduler>;
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

// Mock the telemetry factory
jest.mock('../services/telemetryFactory', () => ({
  createTelemetryService: jest.fn(),
}));

describe('MastodonPingBot', () => {
  let mockConfig: BotConfig;
  let mockLogger: jest.Mocked<Logger>;
  let mockTelemetry: jest.Mocked<TelemetryService>;
  let mockSocialMediaClient: jest.Mocked<SocialMediaClient>;
  let mockScheduler: jest.Mocked<MultiProviderScheduler>;
  let cliOptions: CliOptions;
  let bot: MastodonPingBot;

  beforeEach(async () => {
    mockConfig = {
      accounts: [
        {
          name: 'test-account',
          instance: 'https://test.mastodon',
          accessToken: 'test-token',
        }
      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['test-account'],
            config: { message: 'TEST PING' }
          }
        ]
      },
      logging: {
        level: 'info',
      },
      telemetry: {
        enabled: false,
        serviceName: 'buntspecht',
        serviceVersion: packageJson.version,
        jaeger: {
          enabled: false,
          endpoint: 'http://localhost:14268/api/traces',
        },
        prometheus: {
          enabled: false,
          port: 9090,
          endpoint: '/metrics',
        },
        tracing: {
          enabled: false,
        },
        metrics: {
          enabled: false,
        },
      },
    };

    // Mock ConfigLoader
    (MockConfigLoader.loadConfig as jest.Mock).mockReturnValue(mockConfig);

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      setLevel: jest.fn(),
      isDebugEnabled: jest.fn(),
      isInfoEnabled: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
    MockLogger.mockImplementation(() => mockLogger);

    // Mock TelemetryService
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

    // Mock MastodonClient
    mockSocialMediaClient = {
      verifyConnection: jest.fn().mockResolvedValue(true),
      getAllAccountsInfo: jest.fn().mockResolvedValue([
        {
          accountName: 'test-account',
          account: {
            username: 'testuser',
            displayName: 'Test User',
            followersCount: 100,
            followingCount: 50,
          },
          instance: 'https://test.mastodon'
        }
      ]),
      postStatus: jest.fn(),
    } as unknown as jest.Mocked<SocialMediaClient>;
    MockSocialMediaClient.mockImplementation(() => mockSocialMediaClient);

    // Mock MultiProviderScheduler
    mockScheduler = {
      initialize: jest.fn().mockResolvedValue(undefined),
      start: jest.fn(),
      stop: jest.fn(),
      executeAllTasksNow: jest.fn().mockResolvedValue(undefined),
      executeProviderTaskNow: jest.fn().mockResolvedValue(undefined),
      isSchedulerRunning: jest.fn(),
      getProviderInfo: jest.fn().mockReturnValue([
        { name: 'test-provider', type: 'ping', schedule: '0 * * * *', enabled: true }
      ]),
      getProviderNames: jest.fn().mockReturnValue(['test-provider']),
    } as unknown as jest.Mocked<MultiProviderScheduler>;
    MockMultiProviderScheduler.mockImplementation(() => mockScheduler);

    // Mock the telemetry factory
    const { createTelemetryService } = require('../services/telemetryFactory');
    createTelemetryService.mockResolvedValue(mockTelemetry);

    cliOptions = {};
    bot = new MastodonPingBot(cliOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize config and logger', () => {
      expect(MockConfigLoader.loadConfig).toHaveBeenCalledWith(cliOptions);
      expect(MockLogger).toHaveBeenCalledWith('info');
      // Other services are now initialized in initialize() method
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await bot.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing Buntspecht...');
      
      // Check that telemetry factory was called
      const { createTelemetryService } = require('../services/telemetryFactory');
      expect(createTelemetryService).toHaveBeenCalledWith(mockConfig.telemetry, mockLogger);
      
      expect(mockTelemetry.initialize).toHaveBeenCalled();
      expect(MockSocialMediaClient).toHaveBeenCalledWith(mockConfig, mockLogger, mockTelemetry);
      expect(MockMultiProviderScheduler).toHaveBeenCalledWith(
        expect.any(Object), // SocialMediaClient instance
        mockConfig,
        mockLogger,
        mockTelemetry
      );
      expect(mockSocialMediaClient.verifyConnection).toHaveBeenCalled();
      expect(mockScheduler.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Bot initialized successfully');
    });

    it('should throw error if connection fails', async () => {
      mockSocialMediaClient.verifyConnection.mockResolvedValue(false);

      await expect(bot.initialize()).rejects.toThrow(
        'Failed to connect to social media accounts. Please check your configuration.'
      );
    });
  });

  describe('start', () => {
    it('should start the bot', async () => {
      await bot.initialize();
      await bot.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting Buntspecht...');
      expect(mockScheduler.start).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the bot', async () => {
      await bot.initialize();
      await bot.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping Buntspecht...');
      expect(mockScheduler.stop).toHaveBeenCalled();
      expect(mockTelemetry.shutdown).toHaveBeenCalled();
    });
  });

  describe('testPost', () => {
    it('should post test message', async () => {
      await bot.initialize();
      await bot.testPost();

      expect(mockLogger.info).toHaveBeenCalledWith('Posting test message...');
      expect(mockScheduler.executeAllTasksNow).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('should verify connection and display account info', async () => {
      await bot.initialize();
      await bot.verify();

      expect(mockLogger.info).toHaveBeenCalledWith('Verifying connections...');
      expect(mockSocialMediaClient.verifyConnection).toHaveBeenCalled();
      expect(mockSocialMediaClient.getAllAccountsInfo).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully verified 1 account(s):');
      // Note: The exact log format depends on platform type, so we just check that account info was logged
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('test-account'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Test User'));
      expect(mockLogger.info).toHaveBeenCalledWith('All connections verified successfully');
    });

    it('should throw error if verification fails', async () => {
      await bot.initialize();
      mockSocialMediaClient.verifyConnection.mockResolvedValue(false);

      await expect(bot.verify()).rejects.toThrow('Connection verification failed for one or more accounts');
    });
  });

  describe('setupGracefulShutdown', () => {
    let originalProcessOn: typeof process.on;
    let mockProcessOn: jest.Mock;

    beforeEach(() => {
      originalProcessOn = process.on;
      mockProcessOn = jest.fn();
      process.on = mockProcessOn;
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    it('should setup signal handlers', () => {
      bot.setupGracefulShutdown();

      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });
  });

  describe('getConfig', () => {
    it('should return config', () => {
      expect(bot.getConfig()).toBe(mockConfig);
    });
  });

  describe('getLogger', () => {
    it('should return logger', () => {
      expect(bot.getLogger()).toBe(mockLogger);
    });
  });

  describe('getProviderInfo', () => {
    it('should return provider information', async () => {
      await bot.initialize();
      const providerInfo = bot.getProviderInfo();
      
      expect(providerInfo).toEqual([
        { name: 'test-provider', type: 'ping', schedule: '0 * * * *', enabled: true }
      ]);
      expect(mockScheduler.getProviderInfo).toHaveBeenCalled();
    });
  });

  describe('testPostFromProvider', () => {
    it('should post test message from specific provider', async () => {
      await bot.initialize();
      await bot.testPostFromProvider('test-provider');

      expect(mockLogger.info).toHaveBeenCalledWith('Posting test message from provider: test-provider');
      expect(mockScheduler.executeProviderTaskNow).toHaveBeenCalledWith('test-provider');
    });
  });

  describe('isMultiProviderMode', () => {
    it('should always return true', () => {
      expect(bot.isMultiProviderMode()).toBe(true);
    });
  });
});