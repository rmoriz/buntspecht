import { TemplateMiddleware } from '../../services/middleware/builtin/TemplateMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('TemplateMiddleware', () => {
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

  describe('static data source', () => {
    it('should apply template with static data', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{name}}, welcome to {{platform}}!',
        dataSource: 'static',
        staticData: {
          name: 'John',
          platform: 'Mastodon'
        }
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello John, welcome to Mastodon!');
      expect(context.data['test_template_applied']).toBe(true);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle missing variables with defaults', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{name}}, you have {{count}} messages',
        dataSource: 'static',
        staticData: { name: 'John' },
        defaults: { count: '0' }
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello John, you have 0 messages');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('context data source', () => {
    it('should apply template with context data', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Provider: {{providerName}}, Accounts: {{accountNames}}, Visibility: {{visibility}}',
        dataSource: 'context'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Provider: test-provider, Accounts: test-account, Visibility: public');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should include message text in context data', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Original: {{messageText}}',
        dataSource: 'context'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Original: Hello world');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('metadata data source', () => {
    it('should apply template with metadata', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Posted by {{providerName}} with {{accountCount}} accounts',
        dataSource: 'metadata'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Posted by test-provider with 1 accounts');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should include timestamp information', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Date: {{date}}',
        dataSource: 'metadata'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toMatch(/^Date: \w{3} \w{3} \d{2} \d{4}$/);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('environment data source', () => {
    beforeEach(() => {
      // Set test environment variables
      process.env.TEST_VAR = 'test_value';
      process.env.TEST_PREFIX_NAME = 'prefixed_value';
    });

    afterEach(() => {
      // Clean up environment variables
      delete process.env.TEST_VAR;
      delete process.env.TEST_PREFIX_NAME;
    });

    it('should apply template with environment variables', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Value: {{test_var}}',
        dataSource: 'environment'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Value: test_value');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should use environment variable prefix', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Name: {{name}}',
        dataSource: 'environment',
        envPrefix: 'TEST_PREFIX_'
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Name: prefixed_value');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('alternative syntax', () => {
    it('should support ${variable} syntax', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello ${name}, welcome to ${platform}!',
        dataSource: 'static',
        staticData: {
          name: 'John',
          platform: 'Mastodon'
        }
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello John, welcome to Mastodon!');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should support mixed syntax', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{name}}, welcome to ${platform}!',
        dataSource: 'static',
        staticData: {
          name: 'John',
          platform: 'Mastodon'
        }
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello John, welcome to Mastodon!');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('nested properties', () => {
    it('should support dot notation for nested properties', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'User: {{user.name}}, Email: {{user.contact.email}}',
        dataSource: 'static',
        staticData: {
          user: {
            name: 'John',
            contact: {
              email: 'john@example.com'
            }
          }
        }
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('User: John, Email: john@example.com');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('strict mode', () => {
    it('should throw error for missing variables in strict mode', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{missing}}!',
        dataSource: 'static',
        staticData: {},
        strictMode: true
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow("Template variable 'missing' not found and strict mode is enabled");
    });

    it('should keep placeholders for missing variables when not in strict mode', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{missing}}!',
        dataSource: 'static',
        staticData: {},
        strictMode: false
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello {{missing}}!');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('data tracking', () => {
    it('should track original text and template data', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{name}}!',
        dataSource: 'static',
        staticData: { name: 'John' }
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_original_text']).toBe('Hello world');
      expect(context.data['test_template_applied']).toBe(true);
      expect(context.data['test_template_data']).toEqual({ name: 'John' });
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should not track data when no changes occur', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello world',
        dataSource: 'static',
        staticData: {}
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_original_text']).toBeUndefined();
      expect(context.data['test_template_applied']).toBeUndefined();
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle template processing errors gracefully', async () => {
      const middleware = new TemplateMiddleware('test', {
        template: 'Hello {{user.invalid.deep.property}}!',
        dataSource: 'static',
        staticData: { user: {} },
        strictMode: false
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello {{user.invalid.deep.property}}!');
      expect(nextCalled).toHaveBeenCalled();
    });
  });
});