import * as fs from 'fs';
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
[mastodon]
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]
message = "TEST PING"
cronSchedule = "0 * * * *"

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

      expect(config.mastodon.instance).toBe('https://test.mastodon');
      expect(config.mastodon.accessToken).toBe('test-token');
      expect(config.bot.message).toBe('TEST PING');
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

      expect(config.mastodon.instance).toBe('https://test.mastodon');
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

      expect(config.mastodon.instance).toBe('https://test.mastodon');
    });

    it('should load config from home directory', () => {
      const cliOptions: CliOptions = {};
      const homePath = '/home/user/.config/bot/config.toml';
      
      mockFs.existsSync.mockImplementation((path) => path === homePath);
      mockFs.readFileSync.mockReturnValue(mockConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.mastodon.instance).toBe('https://test.mastodon');
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
[mastodon]
instance = "https://test.mastodon"
accessToken = "test-token"

[bot]

[logging]
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(minimalConfig);

      const config = ConfigLoader.loadConfig(cliOptions);

      expect(config.bot.message).toBe('PING');
      expect(config.bot.cronSchedule).toBe('0 * * * *');
      expect(config.logging.level).toBe('info');
    });

    it('should throw error for missing required fields', () => {
      const invalidConfig = `
[mastodon]
instance = "https://test.mastodon"
# missing accessToken

[bot]
[logging]
`;
      
      const cliOptions: CliOptions = {};
      mockFs.existsSync.mockImplementation((path) => path === './config.toml');
      mockFs.readFileSync.mockReturnValue(invalidConfig);

      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Missing mastodon.accessToken in config'
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

  describe('ensureConfigDirectory', () => {
    it('should create config directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation();

      ConfigLoader.ensureConfigDirectory();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/home/user/.config/bot',
        { recursive: true }
      );
    });

    it('should not create config directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      ConfigLoader.ensureConfigDirectory();

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });
});