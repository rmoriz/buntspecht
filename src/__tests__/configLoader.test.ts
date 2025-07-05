import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader } from '../config/configLoader';
import { CliOptions } from '../types/config';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock os module
jest.mock('os');
const mockOs = os as jest.Mocked<typeof os>;

describe('ConfigLoader', () => {
  const mockConfig = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["test-account"]

[bot.providers.config]
message = "TEST PING"

[logging]
level = "debug"
`;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.BUNTSPECHT_CONFIG;
    mockOs.homedir.mockReturnValue('/home/user');
  });

  describe('loadConfig', () => {
    it('should load config from CLI parameter', () => {
      const cliOptions: CliOptions = { config: '/custom/config.toml' };
      
      mockFs.existsSync.mockImplementation((path) => path === '/custom/config.toml');
      mockFs.readFileSync.mockReturnValue(mockConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.accounts).toHaveLength(1);
      expect(config.accounts[0].name).toBe('test-account');
      expect(config.accounts[0].instance).toBe('https://test.mastodon');
      expect(config.accounts[0].accessToken).toBe('test-token');
      expect(config.bot.providers).toHaveLength(1);
      expect(config.bot.providers[0].name).toBe('test-provider');
      expect(config.bot.providers[0].accounts).toEqual(['test-account']);
      expect(config.bot.providers[0].config.message).toBe('TEST PING');
      expect(config.logging.level).toBe('debug');
    });

    it('should throw error if CLI config file does not exist', () => {
      const cliOptions: CliOptions = { config: '/nonexistent/config.toml' };
      
      mockFs.existsSync.mockReturnValue(false);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Config file specified via CLI not found: /nonexistent/config.toml'
      );
    });

    it('should load config from BUNTSPECHT_CONFIG environment variable', () => {
      process.env.BUNTSPECHT_CONFIG = '/env/config.toml';
      const cliOptions: CliOptions = {};
      
      mockFs.existsSync.mockImplementation((path) => path === '/env/config.toml');
      mockFs.readFileSync.mockReturnValue(mockConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.accounts[0].instance).toBe('https://test.mastodon');
    });

    it('should throw error if BUNTSPECHT_CONFIG file does not exist', () => {
      process.env.BUNTSPECHT_CONFIG = '/nonexistent/config.toml';
      const cliOptions: CliOptions = {};
      
      mockFs.existsSync.mockReturnValue(false);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Config file specified via BUNTSPECHT_CONFIG env var not found: /nonexistent/config.toml'
      );
    });

    it('should load config from current directory', () => {
      const cliOptions: CliOptions = {};
      
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(mockConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.accounts[0].instance).toBe('https://test.mastodon');
    });

    it('should load config from home directory', () => {
      const cliOptions: CliOptions = {};
      const homePath = '/home/user/.config/buntspecht/config.toml';
      
      mockFs.existsSync.mockImplementation((path) => path === homePath);
      mockFs.readFileSync.mockReturnValue(mockConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.accounts[0].instance).toBe('https://test.mastodon');
    });

    it('should throw error if no config file found', () => {
      const cliOptions: CliOptions = {};
      
      mockFs.existsSync.mockReturnValue(false);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'No configuration file found. Please provide a config.toml file.'
      );
    });

    it('should set default values for optional fields', () => {
      const minimalConfig = `
[[accounts]]
name = "minimal-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "minimal-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["minimal-account"]

[bot.providers.config]
message = "PING"

[logging]
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(minimalConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.logging.level).toBe('info');
      expect(config.bot.providers).toHaveLength(1);
      expect(config.bot.providers[0].name).toBe('minimal-provider');
    });

    it('should throw error for missing required fields', () => {
      const invalidConfig = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
# missing accessToken

[bot]
[[bot.providers]]
name = "test"
type = "ping"
cronSchedule = "0 * * * *"
accounts = ["test-account"]

[logging]
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(invalidConfig);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Account "test-account": Missing or invalid accessToken'
      );
    });

    it('should throw error for missing providers', () => {
      const invalidConfig = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
# missing providers

[logging]
level = "info"
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(invalidConfig);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Missing or empty bot.providers array in config. At least one provider must be configured.'
      );
    });

    it('should throw error for provider with missing accounts', () => {
      const invalidConfig = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
# missing accounts

[logging]
level = "info"
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(invalidConfig);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Provider "test-provider": Missing or empty accounts array'
      );
    });

    it('should throw error for provider referencing unknown account', () => {
      const invalidConfig = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
accounts = ["unknown-account"]

[logging]
level = "info"
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(invalidConfig);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Provider "test-provider" references unknown account: "unknown-account"'
      );
    });

    it('should throw error for invalid TOML', () => {
      const invalidToml = `
[mastodon
instance = "https://test.mastodon"
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(invalidToml);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        /Failed to parse config file/
      );
    });
  });

  describe('webhook validation', () => {
    it('should accept valid webhook configuration with secret', () => {
      const configWithWebhook = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["test-account"]

[bot.providers.config]
message = "TEST PING"

[webhook]
enabled = true
port = 3000
secret = "webhook-secret-123"

[logging]
level = "debug"
`;

      const cliOptions: CliOptions = { config: '/test/config.toml' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configWithWebhook);

      expect(() => ConfigLoader.loadConfig(cliOptions)).not.toThrow();
    });

    it('should reject webhook configuration without secret when enabled', () => {
      const configWithoutSecret = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["test-account"]

[bot.providers.config]
message = "TEST PING"

[webhook]
enabled = true
port = 3000

[logging]
level = "debug"
`;

      const cliOptions: CliOptions = { config: '/test/config.toml' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configWithoutSecret);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Webhook is enabled but no global webhook secret is configured. Please set webhook.secret in your configuration for security.'
      );
    });

    it('should reject webhook configuration with empty secret when enabled', () => {
      const configWithEmptySecret = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["test-account"]

[bot.providers.config]
message = "TEST PING"

[webhook]
enabled = true
port = 3000
secret = ""

[logging]
level = "debug"
`;

      const cliOptions: CliOptions = { config: '/test/config.toml' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configWithEmptySecret);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Webhook is enabled but no global webhook secret is configured. Please set webhook.secret in your configuration for security.'
      );
    });

    it('should accept webhook configuration when disabled without secret', () => {
      const configWebhookDisabled = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["test-account"]

[bot.providers.config]
message = "TEST PING"

[webhook]
enabled = false
port = 3000

[logging]
level = "debug"
`;

      const cliOptions: CliOptions = { config: '/test/config.toml' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configWebhookDisabled);

      expect(() => ConfigLoader.loadConfig(cliOptions)).not.toThrow();
    });

    it('should reject invalid webhook port', () => {
      const configInvalidPort = `
[[accounts]]
name = "test-account"
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true
accounts = ["test-account"]

[bot.providers.config]
message = "TEST PING"

[webhook]
enabled = true
port = 99999
secret = "webhook-secret"

[logging]
level = "debug"
`;

      const cliOptions: CliOptions = { config: '/test/config.toml' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configInvalidPort);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Invalid webhook port. Must be a number between 1 and 65535.'
      );
    });
  });

  describe('ensureConfigDirectory', () => {
    it('should create config directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation();

      ConfigLoader.ensureConfigDirectory();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/home/user/.config/buntspecht',
        { recursive: true }
      );
    });

    it('should not create config directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      ConfigLoader.ensureConfigDirectory();

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('File Validation', () => {
    let tempDir: string;
    let configPath: string;

    beforeEach(() => {
      // Use real fs for these integration tests
      jest.unmock('fs');
      const realFs = jest.requireActual('fs');
      tempDir = realFs.mkdtempSync('buntspecht-test-');
      configPath = path.join(tempDir, 'config.toml');
    });

    afterEach(() => {
      const realFs = jest.requireActual('fs');
      if (realFs.existsSync(tempDir)) {
        realFs.rmSync(tempDir, { recursive: true, force: true });
      }
      // Re-mock fs for other tests
      jest.mock('fs');
    });

    it('should validate config file readability', () => {
      const validConfig = `
[logging]
level = "info"

[[accounts]]
name = "test"
instance = "https://mastodon.social"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["test"]

[webhook]
enabled = false
`;
      const realFs = jest.requireActual('fs');
      realFs.writeFileSync(configPath, validConfig);

      expect(() => {
        ConfigLoader.loadConfig({ config: configPath });
      }).not.toThrow();
    });

    it('should validate cache file writeability for multijsoncommand providers', () => {
      const cacheDir = path.join(tempDir, 'cache');
      const configWithCache = `
[logging]
level = "info"

[[accounts]]
name = "test"
instance = "https://mastodon.social"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "multijsoncommand"
accounts = ["test"]
[bot.providers.config]
command = "echo '[]'"
template = "Test message"
[bot.providers.config.cache]
filePath = "${cacheDir.replace(/\\/g, '/')}/test-cache.json"

[webhook]
enabled = false
`;
      const realFs = jest.requireActual('fs');
      realFs.writeFileSync(configPath, configWithCache);

      expect(() => {
        ConfigLoader.loadConfig({ config: configPath });
      }).not.toThrow();

      // Verify cache directory was created
      expect(realFs.existsSync(cacheDir)).toBe(true);
    });

    it('should handle default cache path for multijsoncommand providers', () => {
      const configWithDefaultCache = `
[logging]
level = "info"

[[accounts]]
name = "test"
instance = "https://mastodon.social"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "multijsoncommand"
accounts = ["test"]
[bot.providers.config]
command = "echo '[]'"
template = "Test message"

[webhook]
enabled = false
`;
      const realFs = jest.requireActual('fs');
      realFs.writeFileSync(configPath, configWithDefaultCache);

      expect(() => {
        ConfigLoader.loadConfig({ config: configPath });
      }).not.toThrow();

      // Verify default cache directory was created
      expect(realFs.existsSync('./cache')).toBe(true);
    });

    it('should throw error for non-readable config file', () => {
      if (process.platform === 'win32') {
        // Skip this test on Windows as file permissions work differently
        return;
      }

      const validConfig = `
[logging]
level = "info"

[[accounts]]
name = "test"
instance = "https://mastodon.social"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["test"]

[webhook]
enabled = false
`;
      const realFs = jest.requireActual('fs');
      realFs.writeFileSync(configPath, validConfig);
      realFs.chmodSync(configPath, 0o000); // No permissions

      expect(() => {
        ConfigLoader.loadConfig({ config: configPath });
      }).toThrow(/Configuration file is not readable/);

      // Restore permissions for cleanup
      realFs.chmodSync(configPath, 0o644);
    });

    it('should throw error for non-writable cache directory', () => {
      if (process.platform === 'win32') {
        // Skip this test on Windows as file permissions work differently
        return;
      }

      const realFs = jest.requireActual('fs');
      const readOnlyDir = path.join(tempDir, 'readonly');
      realFs.mkdirSync(readOnlyDir);
      realFs.chmodSync(readOnlyDir, 0o444); // Read-only

      const configWithReadOnlyCache = `
[logging]
level = "info"

[[accounts]]
name = "test"
instance = "https://mastodon.social"
accessToken = "test-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "multijsoncommand"
accounts = ["test"]
[bot.providers.config]
command = "echo '[]'"
template = "Test message"
[bot.providers.config.cache]
filePath = "${readOnlyDir.replace(/\\/g, '/')}/test-cache.json"

[webhook]
enabled = false
`;
      realFs.writeFileSync(configPath, configWithReadOnlyCache);

      expect(() => {
        ConfigLoader.loadConfig({ config: configPath });
      }).toThrow(/Cache directory is not writable/);

      // Restore permissions for cleanup
      realFs.chmodSync(readOnlyDir, 0o755);
    });
  });
});