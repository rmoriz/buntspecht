import { CommandMiddleware } from '../../services/middleware/builtin/CommandMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

// Mock the entire child_process module
jest.mock('child_process');

// Mock util.promisify
jest.mock('util', () => ({
  promisify: jest.fn(() => jest.fn())
}));

import { promisify } from 'util';
const mockExec = promisify({} as any) as jest.MockedFunction<any>;

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

    jest.clearAllMocks();
    mockExec.mockClear();
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
  });

  describe('replace mode', () => {
    it('should replace message with command output', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo "Processed message"',
        mode: 'replace'
      });

      mockExec.mockResolvedValue({ stdout: 'Processed message\n', stderr: '' });

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Processed message');
      expect(context.data['test_original_text']).toBe('Hello world');
      expect(context.data['test_replaced']).toBe(true);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('prepend mode', () => {
    it('should prepend command output to message', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo "Prefix:"',
        mode: 'prepend'
      });

      mockExec.mockResolvedValue({ stdout: 'Prefix:\n', stderr: '' });

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Prefix:Hello world');
      expect(context.data['test_prepended']).toBe('Prefix:');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('append mode', () => {
    it('should append command output to message', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo " - Suffix"',
        mode: 'append'
      });

      mockExec.mockResolvedValue({ stdout: ' - Suffix\n', stderr: '' });

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('Hello world - Suffix');
      expect(context.data['test_appended']).toBe(' - Suffix');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('validate mode', () => {
    it('should continue when command succeeds', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'exit 0',
        mode: 'validate'
      });

      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.data['test_validated']).toBe(true);
      expect(context.skip).toBe(false);
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle command execution errors', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'nonexistent-command',
        mode: 'replace'
      });

      mockExec.mockRejectedValue(new Error('Command not found'));

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow('Command not found');
    });

    it('should skip on validation failure when configured', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'exit 1',
        mode: 'validate',
        skipOnFailure: true,
        skipReason: 'Validation failed'
      });

      mockExec.mockRejectedValue(new Error('Command failed'));

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('Validation failed');
      expect(context.data['test_validation_failed']).toBe(true);
      expect(nextCalled).not.toHaveBeenCalled();
    });
  });

  describe('environment variables', () => {
    it('should pass message as environment variable when useEnvVar is true', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo $MESSAGE_TEXT',
        mode: 'replace',
        useEnvVar: true
      });

      mockExec.mockResolvedValue({ stdout: 'Hello world\n', stderr: '' });

      await middleware.initialize(logger, telemetry);
      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(mockExec).toHaveBeenCalledWith(
        'echo $MESSAGE_TEXT',
        expect.objectContaining({
          env: expect.objectContaining({
            MESSAGE_TEXT: 'Hello world'
          })
        })
      );
      expect(nextCalled).toHaveBeenCalled();
    });
  });
});