import { CommandProvider, CommandProviderConfig } from '../messages/commandProvider';
import { Logger } from '../utils/logger';

describe('CommandProvider', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with required config', () => {
      const config: CommandProviderConfig = {
        command: 'echo "test"'
      };

      const provider = new CommandProvider(config);
      expect(provider.getProviderName()).toBe('command');
    });

    it('should create provider with all config options', () => {
      const config: CommandProviderConfig = {
        command: 'echo "test"',
        timeout: 5000,
        cwd: '/tmp',
        env: { TEST_VAR: 'value' },
        maxBuffer: 2048
      };

      const provider = new CommandProvider(config);
      expect(provider.getProviderName()).toBe('command');
    });

    it('should throw error if command is missing', () => {
      const config: CommandProviderConfig = {} as CommandProviderConfig;

      expect(() => new CommandProvider(config)).toThrow('Command is required for CommandProvider');
    });
  });

  describe('generateMessage', () => {
    it('should execute command and return output', async () => {
      const config: CommandProviderConfig = {
        command: 'echo "Hello World"'
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('Hello World');
    });

    it('should handle command with no output', async () => {
      const config: CommandProviderConfig = {
        command: 'echo ""'
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Command produced no output');
    });

    it('should handle command execution failure', async () => {
      const config: CommandProviderConfig = {
        command: 'nonexistent-command-12345'
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Failed to execute command');
    });

    it('should handle command timeout', async () => {
      const config: CommandProviderConfig = {
        command: 'sleep 2',
        timeout: 100 // 100ms timeout
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Failed to execute command');
    }, 10000);

    it('should trim whitespace from output', async () => {
      const config: CommandProviderConfig = {
        command: 'echo "  Hello World  "'
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('Hello World');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with valid command', async () => {
      const config: CommandProviderConfig = {
        command: 'echo "test"'
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      expect(logger.info).toHaveBeenCalledWith('Initialized CommandProvider with command: "echo "test""');
      expect(logger.info).toHaveBeenCalledWith('Command provider validation successful');
    });

    it('should warn on validation failure but not throw', async () => {
      const config: CommandProviderConfig = {
        command: 'nonexistent-command-12345'
      };

      const provider = new CommandProvider(config);
      await provider.initialize(logger);

      expect(logger.info).toHaveBeenCalledWith('Initialized CommandProvider with command: "nonexistent-command-12345"');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Command provider validation failed'));
    });
  });

  describe('getProviderName', () => {
    it('should return correct provider name', () => {
      const config: CommandProviderConfig = {
        command: 'echo "test"'
      };

      const provider = new CommandProvider(config);
      expect(provider.getProviderName()).toBe('command');
    });
  });
});