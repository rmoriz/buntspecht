import { ScheduleMiddleware } from '../../services/middleware/builtin/ScheduleMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('ScheduleMiddleware', () => {
  let logger: Logger;
  let telemetry: TelemetryService;
  let context: MessageMiddlewareContext;

  beforeEach(() => {
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: "test", serviceVersion: "1.0.0" }, logger);
    
    context = {
      message: { text: 'Hello world' },
      providerName: 'test-provider',
      providerConfig: { name: 'test', type: 'test', accounts: [], config: {} },
      accountNames: ['test-account'],
      visibility: 'public',
      data: {},
      logger,
      telemetry,
      startTime: Date.now(),
      skip: false
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('time rules - allowed hours', () => {
    it('should allow messages during allowed hours', async () => {
      const currentHour = new Date().getHours();
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedHours: [currentHour]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip messages during disallowed hours', async () => {
      const currentHour = new Date().getHours();
      const disallowedHour = currentHour === 23 ? 0 : currentHour + 1;
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedHours: [disallowedHour]
        },
        action: 'skip',
        skipReason: 'Outside allowed hours'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe(`Current hour ${currentHour} not in allowed hours: ${disallowedHour}`);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('time rules - allowed days', () => {
    it('should allow messages on allowed days', async () => {
      const currentDay = new Date().getDay();
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedDays: [currentDay]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip messages on disallowed days', async () => {
      const currentDay = new Date().getDay();
      const disallowedDay = currentDay === 6 ? 0 : currentDay + 1;
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedDays: [disallowedDay]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('time rules - quiet hours', () => {
    it('should skip messages during quiet hours', async () => {
      const currentHour = new Date().getHours();
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          quietHours: { start: currentHour, end: currentHour + 1 }
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should handle overnight quiet hours', async () => {
      // Test quiet hours that span midnight (e.g., 22:00 to 06:00)
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          quietHours: { start: 22, end: 6 }
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      // Mock current time to be 23:00 (should be quiet)
      jest.setSystemTime(new Date('2024-01-01T23:00:00Z'));

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('date rules', () => {
    it('should skip messages on skip dates', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const middleware = new ScheduleMiddleware('test', {
        dateRules: {
          skipDates: [today]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should allow messages on non-skip dates', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const middleware = new ScheduleMiddleware('test', {
        dateRules: {
          skipDates: [tomorrow]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should only allow messages on allow dates when specified', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const middleware = new ScheduleMiddleware('test', {
        dateRules: {
          allowDates: [today]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip messages during skip ranges', async () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const middleware = new ScheduleMiddleware('test', {
        dateRules: {
          skipRanges: [{ start: today, end: tomorrow }]
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('frequency rules', () => {
    it('should enforce minimum interval between messages', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          minInterval: 60000 // 1 minute
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Second message immediately should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
    });

    it('should enforce maximum messages per hour', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          maxPerHour: 1
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Second message in same hour should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
    });

    it('should enforce maximum messages per day', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          maxPerDay: 1
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Second message in same day should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
    });
  });

  describe('delay action', () => {
    it('should delay message when conditions are not met', async () => {
      const currentHour = new Date().getHours();
      const nextHour = (currentHour + 1) % 24;
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedHours: [nextHour]
        },
        action: 'delay',
        maxDelayMs: 5000
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Execute with delay
      const executePromise = middleware.execute(context, nextCalled);
      
      // Advance timers to simulate delay
      jest.advanceTimersByTime(5000);
      
      await executePromise;
      
      expect(context.data['test_delayed']).toBe(true);
      expect(context.data['test_delay_ms']).toBeDefined();
    });

    it('should limit delay to maxDelayMs', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          minInterval: 3600000 // 1 hour
        },
        action: 'delay',
        maxDelayMs: 1000
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message to set last message time
      await middleware.execute(context, nextCalled);
      
      // Second message should be delayed but limited
      context.skip = false;
      const executePromise = middleware.execute(context, nextCalled);
      
      jest.advanceTimersByTime(1000);
      await executePromise;
      
      expect(context.data['test_delay_ms']).toBeLessThanOrEqual(1000);
    });
  });

  describe('queue action', () => {
    it('should queue message for later when conditions are not met', async () => {
      const currentHour = new Date().getHours();
      const nextHour = (currentHour + 1) % 24;
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedHours: [nextHour]
        },
        action: 'queue',
        maxDelayMs: 5000
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Execute with queue
      const executePromise = middleware.execute(context, nextCalled);
      
      // Advance timers to simulate delay
      jest.advanceTimersByTime(5000);
      
      await executePromise;
      
      // Should behave similar to delay for now
      expect(context.skip).toBe(true);
    });

    it('should skip message if queue delay is too long', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          minInterval: 7200000 // 2 hours
        },
        action: 'queue',
        maxDelayMs: 1000 // Much shorter than required delay
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message to set last message time
      await middleware.execute(context, nextCalled);
      
      // Second message should be skipped due to long queue time
      context.skip = false;
      await middleware.execute(context, nextCalled);
      
      expect(context.skip).toBe(true);
      expect(context.skipReason).toContain('queued for too long');
    });
  });

  describe('state management', () => {
    it('should reset hourly counters when hour changes', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          maxPerHour: 2
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Use up hourly limit
      await middleware.execute(context, nextCalled);
      await middleware.execute(context, nextCalled);
      
      // Third message should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      
      // Advance time by 1 hour
      jest.advanceTimersByTime(3600000);
      
      // Message should be allowed again
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });

    it('should reset daily counters when day changes', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          maxPerDay: 1
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Use up daily limit
      await middleware.execute(context, nextCalled);
      
      // Second message should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      
      // Advance time by 1 day
      jest.advanceTimersByTime(24 * 3600000);
      
      // Message should be allowed again
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });
  });

  describe('data tracking', () => {
    it('should track scheduling information', async () => {
      const middleware = new ScheduleMiddleware('test', {
        frequencyRules: {
          maxPerHour: 5,
          maxPerDay: 10
        },
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_allowed']).toBe(true);
      expect(context.data['test_messages_this_hour']).toBe(1);
      expect(context.data['test_messages_this_day']).toBe(1);
    });

    it('should track skip information when message is skipped', async () => {
      const currentHour = new Date().getHours();
      const disallowedHour = currentHour === 23 ? 0 : currentHour + 1;
      
      const middleware = new ScheduleMiddleware('test', {
        timeRules: {
          allowedHours: [disallowedHour]
        },
        action: 'skip',
        skipReason: 'Custom skip reason'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_scheduled_skip']).toBe(true);
      expect(context.data['test_skip_reason']).toBe(`Current hour ${currentHour} not in allowed hours: ${disallowedHour}`);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const middleware = new ScheduleMiddleware('test', {
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn().mockRejectedValue(new Error('Next middleware failed'));
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow('Next middleware failed');
    });
  });
});