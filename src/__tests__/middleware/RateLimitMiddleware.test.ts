import { RateLimitMiddleware } from '../../services/middleware/builtin/RateLimitMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('RateLimitMiddleware', () => {
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

    // Clear any existing timers
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('global scope rate limiting', () => {
    it('should allow messages within rate limit', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 5,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message should be allowed
      await middleware.execute(context, nextCalled);
      
      expect(context.skip).toBe(false);
      expect(context.data['test_count']).toBe(1);
      expect(context.data['test_remaining']).toBe(4);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip messages when rate limit exceeded', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 2,
        windowMs: 60000,
        scope: 'global',
        action: 'skip',
        skipReason: 'Rate limit exceeded'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First two messages should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Third message should be skipped
      context.skip = false; // Reset
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('Rate limit exceeded');
    });

    it('should reset rate limit after window expires', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Second message should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      
      // Advance time past window
      jest.advanceTimersByTime(61000);
      
      // Third message should be allowed again
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });
  });

  describe('provider scope rate limiting', () => {
    it('should rate limit per provider', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'provider',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message for provider should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Second message for same provider should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      
      // Message for different provider should be allowed
      context.skip = false;
      context.providerName = 'different-provider';
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });
  });

  describe('account scope rate limiting', () => {
    it('should rate limit per account combination', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'account',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message for accounts should be allowed
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
      
      // Second message for same accounts should be skipped
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      
      // Message for different accounts should be allowed
      context.skip = false;
      context.accountNames = ['different-account'];
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });
  });

  describe('delay action', () => {
    it('should delay message when rate limit exceeded', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'global',
        action: 'delay',
        maxDelayMs: 5000
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message should be allowed immediately
      const start1 = Date.now();
      await middleware.execute(context, nextCalled);
      const end1 = Date.now();
      
      expect(context.skip).toBe(false);
      expect(end1 - start1).toBeLessThan(100); // Should be immediate
      
      // Second message should be delayed
      context.skip = false;
      const start2 = Date.now();
      
      // Execute with delay
      const executePromise = middleware.execute(context, nextCalled);
      
      // Advance timers to simulate delay
      jest.advanceTimersByTime(5000);
      
      await executePromise;
      
      expect(context.skip).toBe(false);
      expect(context.data['test_delayed']).toBe(true);
      expect(context.data['test_delay_ms']).toBeLessThanOrEqual(5000);
    });

    it('should limit delay to maxDelayMs', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'global',
        action: 'delay',
        maxDelayMs: 1000
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Use up the rate limit
      await middleware.execute(context, nextCalled);
      
      // Second message should be delayed by maxDelayMs
      context.skip = false;
      const executePromise = middleware.execute(context, nextCalled);
      
      jest.advanceTimersByTime(1000);
      await executePromise;
      
      expect(context.data['test_delay_ms']).toBeLessThanOrEqual(1000);
    });
  });

  describe('reset on success', () => {
    it('should reset count on successful execution when enabled', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 2,
        windowMs: 60000,
        scope: 'global',
        action: 'skip',
        resetOnSuccess: true
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // First message
      await middleware.execute(context, nextCalled);
      expect(context.data['test_count']).toBe(1);
      
      // Second message
      await middleware.execute(context, nextCalled);
      expect(context.data['test_count']).toBe(1); // Should be reset to 1 after success
      
      // Third message should still be allowed
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Create a rate limit entry
      await middleware.execute(context, nextCalled);
      
      // Advance time past window
      jest.advanceTimersByTime(61000);
      
      // Trigger cleanup by creating another entry
      context.providerName = 'different-provider';
      context.skip = false;
      await middleware.execute(context, nextCalled);
      
      // Original entry should be cleaned up
      expect(context.skip).toBe(false);
    });

    it('should clean up on middleware cleanup', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);
      await middleware.cleanup();
      
      // Should not throw any errors
      expect(true).toBe(true);
    });
  });

  describe('rate limit status', () => {
    it('should provide rate limit status', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 5,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);
      
      const status = middleware.getRateLimitStatus();
      expect(Object.keys(status)).toContain('global');
      expect(status['global'].count).toBe(1);
    });

    it('should reset rate limit manually', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 1,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      // Use up rate limit
      await middleware.execute(context, nextCalled);
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(true);
      
      // Reset rate limit
      middleware.resetRateLimit('global');
      
      // Should be allowed again
      context.skip = false;
      await middleware.execute(context, nextCalled);
      expect(context.skip).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const middleware = new RateLimitMiddleware('test', {
        maxMessages: 5,
        windowMs: 60000,
        scope: 'global',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn().mockRejectedValue(new Error('Next middleware failed'));
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow('Next middleware failed');
    });
  });
});