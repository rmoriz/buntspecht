import { ConditionalMiddleware } from '../../services/middleware/builtin/ConditionalMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('ConditionalMiddleware', () => {
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
  });

  describe('text conditions', () => {
    it('should continue when text equals condition', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'equals',
          value: 'Hello world'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip when text does not equal condition', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'equals',
          value: 'Different text'
        }],
        action: 'skip',
        skipReason: 'Text condition not met'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('Text condition not met');
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should handle contains operator', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'contains',
          value: 'world'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle case sensitivity', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'contains',
          value: 'WORLD',
          caseSensitive: true
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle regex operator', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'regex',
          value: '^Hello \\w+$'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('length conditions', () => {
    it('should handle greater than operator', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'length',
          operator: 'gt',
          value: 5
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false); // "Hello world" length is 11 > 5
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle less than or equal operator', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'length',
          operator: 'lte',
          value: 20
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false); // "Hello world" length is 11 <= 20
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('time conditions', () => {
    it('should handle hour condition', async () => {
      const currentHour = new Date().getHours();
      
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'time',
          field: 'hour',
          operator: 'equals',
          value: currentHour
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle day of week condition', async () => {
      const currentDay = new Date().getDay();
      
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'time',
          field: 'day',
          operator: 'equals',
          value: currentDay
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('provider conditions', () => {
    it('should handle provider name condition', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'provider',
          operator: 'equals',
          value: 'test-provider'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('account conditions', () => {
    it('should handle account count condition', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'account',
          field: 'count',
          operator: 'equals',
          value: 1
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle account names condition', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'account',
          field: 'names',
          operator: 'not_in',
          value: ['different-account', 'other-account']
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('data conditions', () => {
    it('should handle context data condition', async () => {
      context.data.testValue = 'expected';
      
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'data',
          field: 'testValue',
          operator: 'equals',
          value: 'expected'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle nested data condition', async () => {
      context.data.nested = { value: 'test' };
      
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'data',
          field: 'nested.value',
          operator: 'equals',
          value: 'test'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('environment conditions', () => {
    beforeEach(() => {
      process.env.TEST_CONDITION = 'test_value';
    });

    afterEach(() => {
      delete process.env.TEST_CONDITION;
    });

    it('should handle environment variable condition', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'environment',
          field: 'TEST_CONDITION',
          operator: 'equals',
          value: 'test_value'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('multiple conditions with AND operator', () => {
    it('should require all conditions to be true', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [
          {
            type: 'text',
            operator: 'contains',
            value: 'Hello'
          },
          {
            type: 'length',
            operator: 'gt',
            value: 5
          }
        ],
        operator: 'and',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false); // Both conditions are true
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip when any condition is false', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [
          {
            type: 'text',
            operator: 'contains',
            value: 'Hello'
          },
          {
            type: 'length',
            operator: 'gt',
            value: 50
          }
        ],
        operator: 'and',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true); // Second condition is false
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('multiple conditions with OR operator', () => {
    it('should pass when any condition is true', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [
          {
            type: 'text',
            operator: 'contains',
            value: 'NotFound'
          },
          {
            type: 'length',
            operator: 'gt',
            value: 5
          }
        ],
        operator: 'or',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false); // Second condition is true
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip when all conditions are false', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [
          {
            type: 'text',
            operator: 'contains',
            value: 'NotFound'
          },
          {
            type: 'length',
            operator: 'gt',
            value: 50
          }
        ],
        operator: 'or',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true); // Both conditions are false
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('condition inversion', () => {
    it('should invert the final result when invert is true', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'contains',
          value: 'Hello'
        }],
        action: 'skip',
        invert: true
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true); // Condition is true, but inverted
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('continue action', () => {
    it('should continue when action is continue', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'contains',
          value: 'NotFound'
        }],
        action: 'continue'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('data tracking', () => {
    it('should track condition results', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [
          {
            type: 'text',
            operator: 'contains',
            value: 'Hello'
          },
          {
            type: 'length',
            operator: 'gt',
            value: 5
          }
        ],
        operator: 'and',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_condition_result']).toBe(true);
      expect(context.data['test_individual_results']).toEqual([true, true]);
    });
  });

  describe('error handling', () => {
    it('should handle invalid regex patterns gracefully', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'text',
          operator: 'regex',
          value: '[invalid regex'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true); // Should fail condition due to invalid regex
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should handle unknown condition types', async () => {
      const middleware = new ConditionalMiddleware('test', {
        conditions: [{
          type: 'unknown' as any,
          operator: 'equals',
          value: 'test'
        }],
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true); // Should fail condition due to unknown type
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });
});