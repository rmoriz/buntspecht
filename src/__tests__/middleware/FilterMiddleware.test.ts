import { FilterMiddleware } from '../../services/middleware/builtin/FilterMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('FilterMiddleware', () => {
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

  describe('contains filter', () => {
    it('should skip message when text contains specified string', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'contains',
        text: 'world',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toContain('Filtered by test');
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should continue when text does not contain specified string', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'contains',
        text: 'spam',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should respect case sensitivity setting', async () => {
      context.message.text = 'Hello WORLD';
      
      const middleware = new FilterMiddleware('test', {
        type: 'contains',
        text: 'world',
        caseSensitive: true,
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('not_contains filter', () => {
    it('should skip message when text does not contain specified string', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'not_contains',
        text: 'spam',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('starts_with filter', () => {
    it('should skip message when text starts with specified string', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'starts_with',
        text: 'Hello',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('ends_with filter', () => {
    it('should skip message when text ends with specified string', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'ends_with',
        text: 'world',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('regex filter', () => {
    it('should skip message when text matches regex pattern', async () => {
      context.message.text = 'Contact us at test@example.com';
      
      const middleware = new FilterMiddleware('test', {
        type: 'regex',
        pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should use regex flags', async () => {
      context.message.text = 'HELLO WORLD';
      
      const middleware = new FilterMiddleware('test', {
        type: 'regex',
        pattern: 'hello',
        flags: 'i',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('length filter', () => {
    it('should skip message when text is too short', async () => {
      context.message.text = 'Hi';
      
      const middleware = new FilterMiddleware('test', {
        type: 'length',
        minLength: 5,
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should skip message when text is too long', async () => {
      context.message.text = 'This is a very long message that exceeds the limit';
      
      const middleware = new FilterMiddleware('test', {
        type: 'length',
        maxLength: 10,
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should continue when text length is within bounds', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'length',
        minLength: 5,
        maxLength: 20,
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('empty filter', () => {
    it('should skip empty message', async () => {
      context.message.text = '';
      
      const middleware = new FilterMiddleware('test', {
        type: 'empty',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });

    it('should skip whitespace-only message', async () => {
      context.message.text = '   \n\t  ';
      
      const middleware = new FilterMiddleware('test', {
        type: 'empty',
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('continue action', () => {
    it('should continue processing when action is continue', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'contains',
        text: 'world',
        action: 'continue'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
      expect(context.data['test_matched']).toBe(true);
    });
  });

  describe('custom skip reason', () => {
    it('should use custom skip reason', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'contains',
        text: 'spam',
        action: 'skip',
        skipReason: 'Spam detected'
      });

      context.message.text = 'This is spam content';

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('Spam detected');
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle unknown filter type', async () => {
      const middleware = new FilterMiddleware('test', {
        type: 'unknown' as any,
        action: 'skip'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });
});