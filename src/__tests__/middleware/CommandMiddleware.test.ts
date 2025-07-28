import { CommandMiddleware } from '../../services/middleware/builtin/CommandMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

describe('CommandMiddleware', () => {
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

  describe('constructor validation', () => {
    it('should require command parameter', () => {
      expect(() => {
        new CommandMiddleware('test', {
          command: '',
          mode: 'replace'
        });
      }).toThrow('Command is required');
    });

    it('should accept valid configuration', () => {
      expect(() => {
        new CommandMiddleware('test', {
          command: 'echo test',
          mode: 'replace'
        });
      }).not.toThrow();
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo test',
        mode: 'replace'
      });

      await middleware.initialize(logger, telemetry);
      expect(middleware.name).toBe('test');
      expect(middleware.enabled).toBe(true);
    });
  });

  describe('basic functionality', () => {
    it('should handle middleware execution without crashing', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo test',
        mode: 'validate'
      });

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      
      // This test just ensures the middleware doesn't crash
      await expect(middleware.execute(context, nextCalled)).resolves.not.toThrow();
    });
  });
});