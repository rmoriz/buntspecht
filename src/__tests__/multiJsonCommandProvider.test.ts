import { MultiJsonCommandProvider, MultiJsonCommandProviderConfig } from '../messages/multiJsonCommandProvider';
import { Logger } from '../utils/logger';
import * as fs from 'fs';

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
    
    // Clean up test cache files
    const testCacheFiles = [
      './tmp_rovodev_test_cache.json',
      './tmp_rovodev_test_cache.json.tmp',
      './tmp_rovodev_test_cache_1.json',
      './tmp_rovodev_test_cache_1.json.tmp',
      './tmp_rovodev_test_cache_2.json',
      './tmp_rovodev_test_cache_2.json.tmp',
      './tmp_rovodev_test_cache_3.json',
      './tmp_rovodev_test_cache_3.json.tmp',
      './tmp_rovodev_test_cache_mixed.json',
      './tmp_rovodev_test_cache_mixed.json.tmp',
      './tmp_rovodev_test_cache_basic.json',
      './tmp_rovodev_test_cache_basic.json.tmp',
      './tmp_rovodev_test_cache_nested.json',
      './tmp_rovodev_test_cache_nested.json.tmp',
      './tmp_rovodev_test_cache_external.json',
      './tmp_rovodev_test_cache_external.json.tmp',
      './tmp_rovodev_test_cache_cleanup.json',
      './tmp_rovodev_test_cache_cleanup.json.tmp',
      './cache/tmp_rovodev_test_cache.json',
      './cache/tmp_rovodev_test_cache.json.tmp'
    ];
    
    testCacheFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
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
        cache: {
          enabled: true,
          ttl: 1800000,
          maxSize: 5000,
          filePath: './tmp_rovodev_test_cache.json',
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      expect(provider).toBeDefined();
    });

    it('should use default cache values when cache config is not provided', () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1}]\'',
        template: 'ID: {{id}}',
      };

      const provider = new MultiJsonCommandProvider(config);
      expect(provider).toBeDefined();
    });

    it('should allow disabling cache', () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1}]\'',
        template: 'ID: {{id}}',
        cache: {
          enabled: false,
        },
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
        cache: {
          filePath: './tmp_rovodev_test_cache_basic.json',
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger, undefined, 'test-provider-basic');

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
      await provider.initialize(logger, undefined, 'test-provider');

      const result = await provider.generateMessage();
      expect(result).toBe('Message: {{missing}} (ID: 1)');
      expect(logger.warn).toHaveBeenCalledWith('Template variable "missing" not found in JSON data');
    });

    it('should handle nested properties in template', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "user": {"name": "John Doe", "email": "john@example.com"}}]\'',
        template: 'User: {{user.name}} ({{user.email}})',
        cache: {
          filePath: './tmp_rovodev_test_cache_nested.json',
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger, undefined, 'test-provider-nested');

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
      await provider.initialize(logger, undefined, 'test-provider');

      expect(logger.info).toHaveBeenCalledWith('Initialized MultiJsonCommandProvider "test-provider" with command: "echo \'[{"id": 1, "message": "test"}]\'"');
      expect(logger.info).toHaveBeenCalledWith('Template: "Message: {{message}}"');
      expect(logger.info).toHaveBeenCalledWith('Unique key: "id"');
      expect(logger.info).toHaveBeenCalledWith('Throttle delay: 500ms (DEPRECATED: Use cron schedule for timing)');
    });
  });

  describe('caching functionality', () => {
    it('should skip cached items on subsequent runs', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "Hello"}, {"id": 2, "message": "World"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: true,
          ttl: 60000, // 1 minute
          filePath: './tmp_rovodev_test_cache_1.json',
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger, undefined, 'test-provider');

      // First run - should process first item
      const result1 = await provider.generateMessage();
      expect(result1).toBe('Message: Hello');
      expect(logger.info).toHaveBeenCalledWith('Found 2 objects to process');

      // Second run - should process second item (first is cached)
      const result2 = await provider.generateMessage();
      expect(result2).toBe('Message: World');
      expect(logger.info).toHaveBeenCalledWith('Skipped 1 cached items, found 1 new item to process');

      // Third run - should skip all cached items
      const result3 = await provider.generateMessage();
      expect(result3).toBe('');
      expect(logger.info).toHaveBeenCalledWith('Skipped 2 cached items, no new items to process');
    });

    it('should process items when cache is disabled', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "Hello"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: false,
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      // First run
      const result1 = await provider.generateMessage();
      expect(result1).toBe('Message: Hello');

      // Second run - should process again since cache is disabled
      const result2 = await provider.generateMessage();
      expect(result2).toBe('Message: Hello');
    });

    it('should handle cache TTL expiration', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "Hello"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: true,
          ttl: 50, // Very short TTL for testing
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      // First run
      const result1 = await provider.generateMessage();
      expect(result1).toBe('Message: Hello');

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second run - should process again since cache expired
      const result2 = await provider.generateMessage();
      expect(result2).toBe('Message: Hello');
    });

    it('should log cache configuration during initialization', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "test"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: true,
          ttl: 1800000,
          maxSize: 5000,
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger, undefined, 'test-provider');

      expect(logger.info).toHaveBeenCalledWith('Cache enabled: TTL=1800000ms, Max size=5000, File: ./cache/multijson-cache.json');
    });

    it('should log when cache is disabled', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "test"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: false,
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger);

      expect(logger.info).toHaveBeenCalledWith('Cache disabled');
    });

    it('should handle mixed new and cached items', async () => {
      const provider = new MultiJsonCommandProvider({
        command: 'echo \'[{"id": 1, "message": "Hello"}, {"id": 2, "message": "World"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: true,
          ttl: 60000,
          filePath: './tmp_rovodev_test_cache_mixed.json',
        },
      });
      await provider.initialize(logger, undefined, 'test-provider-mixed');

      // First run with two items - processes first item
      const result1 = await provider.generateMessage();
      expect(result1).toBe('Message: Hello');

      // Second run - processes second item (first is cached)
      const result2a = await provider.generateMessage();
      expect(result2a).toBe('Message: World');

      // Manually update the command to include a third item
      // This simulates getting new data from the external command
      (provider as unknown as { command: string }).command = `echo '[{"id": 1, "message": "Hello"}, {"id": 2, "message": "World"}, {"id": 3, "message": "New"}]'`;

      // Third run with three items - should only process the new one
      const result3 = await provider.generateMessage();
      expect(result3).toBe('Message: New'); // Should return the new item's message
      expect(logger.info).toHaveBeenCalledWith('Skipped 2 cached items, found 1 new item to process');
    });

    it('should detect external cache file modifications and reload', async () => {
      const cacheFilePath = './tmp_rovodev_test_cache_external.json';
      
      // Clean up any existing cache file
      if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath);
      }

      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "Hello"}, {"id": 2, "message": "World"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: true,
          ttl: 60000,
          filePath: cacheFilePath,
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger, undefined, 'test-provider-external');

      // First run - should process first item and create cache
      const result1 = await provider.generateMessage();
      expect(result1).toBe('Message: Hello');
      
      // Verify cache file was created
      expect(fs.existsSync(cacheFilePath)).toBe(true);

      // Second run - should process second item (first is cached)
      const result2 = await provider.generateMessage();
      expect(result2).toBe('Message: World');

      // Externally modify the cache file to remove all entries
      // This simulates external cache manipulation
      const emptyCacheData = {};
      fs.writeFileSync(cacheFilePath, JSON.stringify(emptyCacheData, null, 2), 'utf-8');
      
      // Wait a bit to ensure file modification time is different
      await new Promise(resolve => setTimeout(resolve, 10));

      // Third run - should detect cache file modification and reload
      // Since cache is now empty, it should process the first item again
      const result3 = await provider.generateMessage();
      expect(result3).toBe('Message: Hello');
      
      // Verify that the external modification was detected
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Cache file has been modified externally, reloading'));

      // Clean up
      if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath);
      }
    });

    it('should handle cleanup properly', async () => {
      const config: MultiJsonCommandProviderConfig = {
        command: 'echo \'[{"id": 1, "message": "test"}]\'',
        template: 'Message: {{message}}',
        cache: {
          enabled: true,
          filePath: './tmp_rovodev_test_cache_cleanup.json',
        },
      };

      const provider = new MultiJsonCommandProvider(config);
      await provider.initialize(logger, undefined, 'test-provider-cleanup');

      // Generate a message to create cache
      const result = await provider.generateMessage();
      expect(result).toBe('Message: test');

      // Verify cache file was created
      expect(fs.existsSync('./tmp_rovodev_test_cache_cleanup.json')).toBe(true);

      // Call cleanup - should not throw and should save cache
      await expect(provider.cleanup()).resolves.not.toThrow();

      // Clean up test file
      const cacheFile = './tmp_rovodev_test_cache_cleanup.json';
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    });
  });
});