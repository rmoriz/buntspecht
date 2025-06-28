import { JsonCommandProvider, JsonCommandProviderConfig } from '../messages/jsonCommandProvider';
import { Logger } from '../utils/logger';

describe('JsonCommandProvider', () => {
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
    it('should create instance with valid config', () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo \'{"test": "value"}\'',
        template: 'Test: {{test}}'
      };

      const provider = new JsonCommandProvider(config);
      expect(provider.getProviderName()).toBe('jsoncommand');
    });

    it('should throw error if command is missing', () => {
      const config = {
        template: 'Test: {{test}}'
      } as JsonCommandProviderConfig;

      expect(() => new JsonCommandProvider(config)).toThrow('Command is required for JsonCommandProvider');
    });

    it('should throw error if template is missing', () => {
      const config = {
        command: 'echo \'{"test": "value"}\''
      } as JsonCommandProviderConfig;

      expect(() => new JsonCommandProvider(config)).toThrow('Template is required for JsonCommandProvider');
    });
  });

  describe('generateMessage', () => {
    it('should execute command, parse JSON and apply template', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo \'{"name": "test", "count": 42}\'',
        template: 'Name: {{name}}, Count: {{count}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('Name: test, Count: 42');
    });

    it('should handle nested JSON properties', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo \'{"user": {"name": "John", "age": 30}}\'',
        template: 'User: {{user.name}}, Age: {{user.age}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('User: John, Age: 30');
    });

    it('should handle missing template variables gracefully', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo \'{"name": "test"}\'',
        template: 'Name: {{name}}, Missing: {{missing}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('Name: test, Missing: {{missing}}');
    });

    it('should throw error for invalid JSON', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo "invalid json"',
        template: 'Test: {{test}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Failed to parse command output as JSON');
    });

    it('should throw error for empty command output', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo ""',
        template: 'Test: {{test}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Command produced no output');
    });

    it('should throw error for command execution failure', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'nonexistent-command-12345',
        template: 'Test: {{test}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      await expect(provider.generateMessage()).rejects.toThrow('Failed to execute JSON command');
    });
  });

  describe('template processing', () => {
    it('should handle multiple occurrences of same variable', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo \'{"name": "test"}\'',
        template: '{{name}} says hello to {{name}}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('test says hello to test');
    });

    it('should handle variables with whitespace in template', async () => {
      const config: JsonCommandProviderConfig = {
        command: 'echo \'{"name": "test"}\'',
        template: 'Name: {{ name }}'
      };

      const provider = new JsonCommandProvider(config);
      await provider.initialize(logger);

      const message = await provider.generateMessage();
      expect(message).toBe('Name: test');
    });
  });
});