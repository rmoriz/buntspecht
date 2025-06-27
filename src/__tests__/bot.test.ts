import { MastodonPingBot } from '../bot';
import { ConfigLoader } from '../config/configLoader';
import { MastodonClient } from '../services/mastodonClient';
import { BotScheduler } from '../services/botScheduler';
import { Logger } from '../utils/logger';
import { CliOptions, BotConfig } from '../types/config';

// Mock all dependencies
jest.mock('../config/configLoader');
jest.mock('../services/mastodonClient');
jest.mock('../services/botScheduler');
jest.mock('../utils/logger');

const MockConfigLoader = ConfigLoader as jest.MockedClass<typeof ConfigLoader>;
const MockMastodonClient = MastodonClient as jest.MockedClass<typeof MastodonClient>;
const MockBotScheduler = BotScheduler as jest.MockedClass<typeof BotScheduler>;
const MockLogger = Logger as jest.MockedClass<typeof Logger>;

describe('MastodonPingBot', () => {
  let mockConfig: BotConfig;
  let mockLogger: jest.Mocked<Logger>;
  let mockMastodonClient: jest.Mocked<MastodonClient>;
  let mockScheduler: jest.Mocked<BotScheduler>;
  let cliOptions: CliOptions;
  let bot: MastodonPingBot;

  beforeEach(() => {
    mockConfig = {
      mastodon: {
        instance: 'https://test.mastodon',
        accessToken: 'test-token',
      },
      bot: {
        message: 'TEST PING',
        cronSchedule: '0 * * * *',
      },
      logging: {
        level: 'info',
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

    // Mock MastodonClient
    mockMastodonClient = {
      verifyConnection: jest.fn().mockResolvedValue(true),
      getAccountInfo: jest.fn().mockResolvedValue({
        username: 'testuser',
        displayName: 'Test User',
        followersCount: 100,
        followingCount: 50,
      }),
      postStatus: jest.fn(),
    } as unknown as jest.Mocked<MastodonClient>;
    MockMastodonClient.mockImplementation(() => mockMastodonClient);

    // Mock BotScheduler
    mockScheduler = {
      start: jest.fn(),
      stop: jest.fn(),
      executeTaskNow: jest.fn().mockResolvedValue(undefined),
      executeTask: jest.fn(),
      isSchedulerRunning: jest.fn(),
      getSchedule: jest.fn(),
    } as unknown as jest.Mocked<BotScheduler>;
    MockBotScheduler.mockImplementation(() => mockScheduler);

    cliOptions = {};
    bot = new MastodonPingBot(cliOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all components', () => {
      expect(MockConfigLoader.loadConfig).toHaveBeenCalledWith(cliOptions);
      expect(MockLogger).toHaveBeenCalledWith('info');
      expect(MockMastodonClient).toHaveBeenCalledWith(mockConfig, mockLogger);
      expect(MockBotScheduler).toHaveBeenCalledWith(
        mockMastodonClient,
        mockConfig,
        mockLogger
      );
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await bot.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing Buntspecht...');
      expect(mockMastodonClient.verifyConnection).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Bot initialized successfully');
    });

    it('should throw error if connection fails', async () => {
      mockMastodonClient.verifyConnection.mockResolvedValue(false);

      await expect(bot.initialize()).rejects.toThrow(
        'Failed to connect to Mastodon. Please check your configuration.'
      );
    });
  });

  describe('start', () => {
    it('should start the bot', () => {
      bot.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting Buntspecht...');
      expect(mockScheduler.start).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the bot', () => {
      bot.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping Buntspecht...');
      expect(mockScheduler.stop).toHaveBeenCalled();
    });
  });

  describe('testPost', () => {
    it('should post test message', async () => {
      await bot.testPost();

      expect(mockLogger.info).toHaveBeenCalledWith('Posting test message...');
      expect(mockScheduler.executeTaskNow).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('should verify connection and display account info', async () => {
      await bot.verify();

      expect(mockLogger.info).toHaveBeenCalledWith('Verifying connection...');
      expect(mockMastodonClient.verifyConnection).toHaveBeenCalled();
      expect(mockMastodonClient.getAccountInfo).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Account: @testuser');
      expect(mockLogger.info).toHaveBeenCalledWith('Display Name: Test User');
      expect(mockLogger.info).toHaveBeenCalledWith('Followers: 100');
      expect(mockLogger.info).toHaveBeenCalledWith('Following: 50');
      expect(mockLogger.info).toHaveBeenCalledWith('Connection verified successfully');
    });

    it('should throw error if verification fails', async () => {
      mockMastodonClient.verifyConnection.mockResolvedValue(false);

      await expect(bot.verify()).rejects.toThrow('Connection verification failed');
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
});