import { BotScheduler } from '../services/botScheduler';
import { MastodonClient } from '../services/mastodonClient';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';
import * as cron from 'node-cron';

// Mock node-cron
jest.mock('node-cron');
const mockCron = cron as jest.Mocked<typeof cron>;

// Mock MastodonClient
jest.mock('../services/mastodonClient');
const MockMastodonClient = MastodonClient as jest.MockedClass<typeof MastodonClient>;

describe('BotScheduler', () => {
  let mockMastodonClient: jest.Mocked<MastodonClient>;
  let mockTask: { start: jest.Mock; stop: jest.Mock };
  let config: BotConfig;
  let logger: Logger;
  let scheduler: BotScheduler;

  beforeEach(() => {
    // Create mock task
    mockTask = {
      start: jest.fn(),
      stop: jest.fn(),
    };

    // Mock cron functions
    mockCron.validate.mockReturnValue(true);
    mockCron.schedule.mockReturnValue(mockTask as unknown as cron.ScheduledTask);

    // Create mock MastodonClient
    mockMastodonClient = new MockMastodonClient({} as BotConfig, {} as Logger) as jest.Mocked<MastodonClient>;
    mockMastodonClient.postStatus = jest.fn().mockResolvedValue(undefined);

    config = {
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

    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();

    scheduler = new BotScheduler(mockMastodonClient, config, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should start scheduler successfully', () => {
      scheduler.start();

      expect(mockCron.validate).toHaveBeenCalledWith('0 * * * *');
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '0 * * * *',
        expect.any(Function),
        {
          scheduled: false,
          timezone: 'UTC',
        }
      );
      expect(mockTask.start).toHaveBeenCalled();
      expect(scheduler.isSchedulerRunning()).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Starting bot scheduler with cron: 0 * * * *');
      expect(logger.info).toHaveBeenCalledWith('Message to post: "TEST PING"');
      expect(logger.info).toHaveBeenCalledWith('Bot scheduler started successfully');
    });

    it('should not start if already running', () => {
      scheduler.start();
      jest.clearAllMocks();

      scheduler.start();

      expect(mockCron.schedule).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Bot scheduler is already running');
    });

    it('should throw error for invalid cron schedule', () => {
      mockCron.validate.mockReturnValue(false);

      expect(() => scheduler.start()).toThrow('Invalid cron schedule: 0 * * * *');
    });
  });

  describe('stop', () => {
    it('should stop scheduler successfully', () => {
      scheduler.start();
      scheduler.stop();

      expect(mockTask.stop).toHaveBeenCalled();
      expect(scheduler.isSchedulerRunning()).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Bot scheduler stopped');
    });

    it('should warn if not running', () => {
      scheduler.stop();

      expect(logger.warn).toHaveBeenCalledWith('Bot scheduler is not running');
    });
  });

  describe('executeTask', () => {
    it('should execute task successfully', async () => {
      await scheduler.executeTask();

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('TEST PING');
      expect(logger.debug).toHaveBeenCalledWith('Executing scheduled task...');
      expect(logger.debug).toHaveBeenCalledWith('Scheduled task completed successfully');
    });

    it('should handle task execution error', async () => {
      const error = new Error('Post failed');
      mockMastodonClient.postStatus.mockRejectedValue(error);

      await scheduler.executeTask();

      expect(logger.error).toHaveBeenCalledWith('Failed to execute scheduled task:', error);
    });
  });

  describe('executeTaskNow', () => {
    it('should execute task immediately', async () => {
      await scheduler.executeTaskNow();

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('TEST PING');
      expect(logger.info).toHaveBeenCalledWith('Executing task immediately...');
    });
  });

  describe('getSchedule', () => {
    it('should return current schedule', () => {
      expect(scheduler.getSchedule()).toBe('0 * * * *');
    });
  });

  describe('scheduled task execution', () => {
    it('should execute task when cron triggers', async () => {
      scheduler.start();

      // Get the scheduled function
      const scheduledFunction = mockCron.schedule.mock.calls[0][1] as () => Promise<void>;
      
      // Execute it
      await scheduledFunction();

      expect(mockMastodonClient.postStatus).toHaveBeenCalledWith('TEST PING');
    });
  });
});