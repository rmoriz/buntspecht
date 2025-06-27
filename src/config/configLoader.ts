import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';
import { BotConfig, CliOptions } from '../types/config';

export class ConfigLoader {
  private static getDefaultConfigPaths(): string[] {
    return [
      './config.toml',
      path.join(os.homedir(), '.config', 'buntspecht', 'config.toml')
    ];
  }

  /**
   * Loads configuration from various sources in priority order:
   * 1. CLI --config parameter
   * 2. BUNTSPECHT_CONFIG environment variable
   * 3. ./config.toml
   * 4. ~/.config/buntspecht/config.toml
   */
  public static loadConfig(cliOptions: CliOptions): BotConfig {
    const configPath = this.findConfigPath(cliOptions);
    
    if (!configPath) {
      throw new Error('No configuration file found. Please provide a config.toml file.');
    }

    return this.parseConfigFile(configPath);
  }

  private static findConfigPath(cliOptions: CliOptions): string | null {
    // 1. CLI --config parameter
    if (cliOptions.config) {
      if (fs.existsSync(cliOptions.config)) {
        return cliOptions.config;
      }
      throw new Error(`Config file specified via CLI not found: ${cliOptions.config}`);
    }

    // 2. BUNTSPECHT_CONFIG environment variable
    const envConfigPath = process.env.BUNTSPECHT_CONFIG;
    if (envConfigPath) {
      if (fs.existsSync(envConfigPath)) {
        return envConfigPath;
      }
      throw new Error(`Config file specified via BUNTSPECHT_CONFIG env var not found: ${envConfigPath}`);
    }

    // 3. Default paths
    for (const defaultPath of this.getDefaultConfigPaths()) {
      if (fs.existsSync(defaultPath)) {
        return defaultPath;
      }
    }

    return null;
  }

  private static parseConfigFile(configPath: string): BotConfig {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const parsedConfig = toml.parse(configContent);
      
      this.validateConfig(parsedConfig);
      
      return parsedConfig as BotConfig;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse config file ${configPath}: ${error.message}`);
      }
      throw error;
    }
  }

  private static validateConfig(config: Record<string, unknown>): void {
    const mastodon = config.mastodon as Record<string, unknown> | undefined;
    if (!mastodon) {
      throw new Error('Missing [mastodon] section in config');
    }
    
    if (!mastodon.instance) {
      throw new Error('Missing mastodon.instance in config');
    }
    
    if (!mastodon.accessToken) {
      throw new Error('Missing mastodon.accessToken in config');
    }

    const bot = config.bot as Record<string, unknown> | undefined;
    if (!bot) {
      throw new Error('Missing [bot] section in config');
    }

    const logging = config.logging as Record<string, unknown> | undefined;
    if (!logging) {
      throw new Error('Missing [logging] section in config');
    }

    // Set defaults
    bot.message = bot.message || 'PING';
    bot.cronSchedule = bot.cronSchedule || '0 * * * *'; // Every hour
    logging.level = logging.level || 'info';
  }

  /**
   * Creates the default config directory if it doesn't exist
   */
  public static ensureConfigDirectory(): void {
    const configDir = path.join(os.homedir(), '.config', 'buntspecht');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }
}
