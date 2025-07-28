import { TextTransformMiddleware } from '../../services/middleware/builtin/TextTransformMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('TextTransformMiddleware', () => {
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

  describe('uppercase transform', () => {
    it('should convert text to uppercase', async () => {
      const middleware = new TextTransformMiddleware('test', {
        transform: 'uppercase'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('HELLO WORLD');
      expect(nextCalled).toHaveBeenCalled();
      expect(context.data['test_transformed']).toBe(true);
    });
  });

  describe('lowercase transform', () => {
    it('should convert text to lowercase', async () => {
      context.message.text = 'HELLO WORLD';
      
      const middleware = new TextTransformMiddleware('test', {
        transform: 'lowercase'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('hello world');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('capitalize transform', () => {
    it('should capitalize first letter', async () => {
      context.message.text = 'hello world';
      
      const middleware = new TextTransformMiddleware('test', {
        transform: 'capitalize'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello world');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('trim transform', () => {
    it('should remove leading and trailing whitespace', async () => {
      context.message.text = '  hello world  ';
      
      const middleware = new TextTransformMiddleware('test', {
        transform: 'trim'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('hello world');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('replace transform', () => {
    it('should replace text with string replacement', async () => {
      context.message.text = 'hello world';
      
      const middleware = new TextTransformMiddleware('test', {
        transform: 'replace',
        search: 'world',
        replacement: 'universe'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('hello universe');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should replace text with regex', async () => {
      context.message.text = 'hello world 123';
      
      const middleware = new TextTransformMiddleware('test', {
        transform: 'replace',
        search: '\\d+',
        replacement: 'XXX',
        useRegex: true
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('hello world XXX');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('prepend transform', () => {
    it('should prepend text', async () => {
      const middleware = new TextTransformMiddleware('test', {
        transform: 'prepend',
        prefix: '🤖 '
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('🤖 Hello world');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('append transform', () => {
    it('should append text', async () => {
      const middleware = new TextTransformMiddleware('test', {
        transform: 'append',
        suffix: ' #test'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello world #test');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('disabled middleware', () => {
    it('should not be registered when disabled', async () => {
      const middleware = new TextTransformMiddleware('test', {
        transform: 'uppercase'
      }, false);

      expect(middleware.enabled).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle unknown transform type', async () => {
      const middleware = new TextTransformMiddleware('test', {
        transform: 'unknown' as any
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      // Should not modify text for unknown transform
      expect(context.message.text).toBe('Hello world');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('data tracking', () => {
    it('should track original text when transformation occurs', async () => {
      const middleware = new TextTransformMiddleware('test', {
        transform: 'uppercase'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_original_text']).toBe('Hello world');
      expect(context.data['test_transformed']).toBe(true);
    });

    it('should not track data when no transformation occurs', async () => {
      context.message.text = '';
      
      const middleware = new TextTransformMiddleware('test', {
        transform: 'trim'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_original_text']).toBeUndefined();
      expect(context.data['test_transformed']).toBeUndefined();
    });
  });
});