import { CommandMiddleware } from '../../services/middleware/builtin/CommandMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';
import { exec } from 'child_process';

// Mock child_process
jest.mock('child_process');
const mockedExec = exec as jest.MockedFunction<typeof exec>;

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

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('replace mode', () => {
    it('should replace message with command output', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo "Processed message"',
        mode: 'replace'
      });

      // Mock successful command execution
      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, 'Processed message\n', '');
        }
        return {} as any;
      });

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

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, 'Prefix:\n', '');
        }
        return {} as any;
      });

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

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, ' - Suffix\n', '');
        }
        return {} as any;
      });

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

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, '', '');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.skip).toBe(false);
      expect(context.data['test_validated']).toBe(true);
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should skip when command fails and skipOnFailure is true', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'exit 1',
        mode: 'validate',
        skipOnFailure: true,
        skipReason: 'Validation failed'
      });

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(new Error('Command failed'), '', '');
        }
        return {} as any;
      });

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

      let capturedEnv: any;
      mockedExec.mockImplementation((command, options, callback) => {
        capturedEnv = options?.env;
        if (callback) {
          callback(null, 'Hello world\n', '');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(capturedEnv.MESSAGE_TEXT).toBe('Hello world');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should include custom environment variables', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo $CUSTOM_VAR',
        mode: 'replace',
        env: { CUSTOM_VAR: 'custom_value' }
      });

      let capturedEnv: any;
      mockedExec.mockImplementation((command, options, callback) => {
        capturedEnv = options?.env;
        if (callback) {
          callback(null, 'custom_value\n', '');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(capturedEnv.CUSTOM_VAR).toBe('custom_value');
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('stdin input', () => {
    it('should pass message as stdin when useStdin is true', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'cat',
        mode: 'replace',
        useStdin: true
      });

      // Mock the child process for stdin
      const mockChild = {
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        }
      };

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, 'Hello world\n', '');
        }
        return mockChild as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(mockChild.stdin.write).toHaveBeenCalledWith('Hello world');
      expect(mockChild.stdin.end).toHaveBeenCalled();
      expect(nextCalled).toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should respect timeout configuration', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'sleep 10',
        mode: 'replace',
        timeout: 1000
      });

      let capturedOptions: any;
      mockedExec.mockImplementation((command, options, callback) => {
        capturedOptions = options;
        if (callback) {
          callback(new Error('Timeout'), '', '');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow();
      expect(capturedOptions.timeout).toBe(1000);
    });
  });

  describe('error handling', () => {
    it('should handle command execution errors', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'nonexistent-command',
        mode: 'replace'
      });

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(new Error('Command not found'), '', 'Command not found');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow('Failed to execute command');
    });

    it('should handle stderr output', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo "warning" >&2; echo "output"',
        mode: 'replace'
      });

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, 'output\n', 'warning\n');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      await middleware.execute(context, nextCalled);

      expect(context.message.text).toBe('output');
      expect(nextCalled).toHaveBeenCalled();
    });

    it('should handle empty command output', async () => {
      const middleware = new CommandMiddleware('test', {
        command: 'echo ""',
        mode: 'replace'
      });

      mockedExec.mockImplementation((command, options, callback) => {
        if (callback) {
          callback(null, '', '');
        }
        return {} as any;
      });

      await middleware.initialize(logger, telemetry);

      const nextCalled = jest.fn();
      
      await expect(middleware.execute(context, nextCalled)).rejects.toThrow('Command produced no output');
    });
  });

  describe('configuration validation', () => {
    it('should require command parameter', () => {
      expect(() => {
        new CommandMiddleware('test', {
          command: '',
          mode: 'replace'
        });
      }).toThrow('Command is required for CommandProvider');
    });
  });
});