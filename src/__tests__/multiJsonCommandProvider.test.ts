import { MultiJsonCommandProvider, MultiJsonCommandProviderConfig } from '../messages/multiJsonCommandProvider';
import { Logger } from '../utils/logger';

describe('MultiJsonCommandProvider', () => {
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
    it('should create provider with valid config', () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "test"}]\'',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      expect(provider.getProviderName()).toBe('multijsoncommand');
    });

    it('should throw error if command is missing', () => {
      const config = {
        template: 'Message: {{message}}',
      } as MultiJsonCommandProviderConfig;

      expect(() => new MultiJsonCommandProvider(config)).toThrow('Command is required for MultiJsonCommandProvider');
    });

    it('should throw error if template is missing', () => {
      const config = {
        command: 'echo \'[{"id": 1}]\'',
      } as MultiJsonCommandProviderConfig;

      expect(() => new MultiJsonCommandProvider(config)).toThrow('Template is required for MultiJsonCommandProvider');
    });

    it('should use default values for optional config', () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1}]\'',
        template: 'ID: {{id}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      // Test that it doesn't throw and uses defaults
      expect(provider).toBeDefined();
    });

    it('should use custom config values', () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"uuid": "abc", "text": "hello"}]\'',
        template: 'Text: {{text}}',
        uniqueKey: 'uuid',
        throttleDelay: 500,
        timeout: 5000,
      };

      const provider = new MultiJsonCommandProvider(config);
      expect(provider).toBeDefined();
    });
  });

  describe('generateMessage', () => {
    it('should process JSON array and return first message', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "Hello"}, {"id": 2, "message": "World"}]\'',
        template: 'Message: {{message}} (ID: {{id}})',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      const result = await provider.generateMessage();
      expect(result).toBe('Message: Hello (ID: 1)');
    });

    it('should handle empty array', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[]\'',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      const result = await provider.generateMessage();
      expect(result).toBe('');
      expect(logger.info).toHaveBeenCalledWith('Command returned empty array, no messages to send');
    });

    it('should throw error if output is not an array', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'{"id": 1, "message": "test"}\'',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Command output must be a JSON array');
    });

    it('should throw error if array contains non-objects', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1}, "not an object"]\'',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Array item at index 1 is not an object');
    });

    it('should validate unique keys', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"message": "test"}]\'',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Object at index 0 is missing required unique key "id"');
    });

    it('should detect duplicate unique keys', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "first"}, {"id": 1, "message": "second"}]\'',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Duplicate unique key value "1" found in array');
    });

    it('should use custom unique key', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"uuid": "abc-123", "text": "Hello"}]\'',
        template: 'Message: {{text}}',
        uniqueKey: 'uuid',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      const result = await provider.generateMessage();
      expect(result).toBe('Message: Hello');
    });

    it('should handle template variables not found', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "Hello"}]\'',
        template: 'Message: {{missing}} (ID: {{id}})',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      const result = await provider.generateMessage();
      expect(result).toBe('Message: {{missing}} (ID: 1)');
      expect(logger.warn).toHaveBeenCalledWith('Template variable "missing" not found in JSON data');
    });

    it('should handle nested properties in template', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "user": {"name": "John Doe", "email": "john@example.com"}}]\'',
        template: 'User: {{user.name}} ({{user.email}})',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      const result = await provider.generateMessage();
      expect(result).toBe('User: John Doe (john@example.com)');
    });

    it('should handle command execution errors', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'nonexistent-command-12345',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Failed to execute multi JSON command');
    });

    it('should handle invalid JSON output', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo "invalid json"',
        template: 'Message: {{message}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Failed to parse command output as JSON');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "test"}]\'',
        template: 'Message: {{message}}',
        uniqueKey: 'id',
        throttleDelay: 500,
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      expect(logger.info).toHaveBeenCalledWith('Initialized MultiJsonCommandProvider with command: "echo \'[{"id": 1, "message": "test"}]\'"');
      expect(logger.info).toHaveBeenCalledWith('Template: "Message: {{message}}"');
      expect(logger.info).toHaveBeenCalledWith('Unique key: "id"');
      expect(logger.info).toHaveBeenCalledWith('Throttle delay: 500ms');
    });
  });
});