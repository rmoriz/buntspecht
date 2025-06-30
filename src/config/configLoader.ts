import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';
import { BotConfig, CliOptions, TelemetryConfig } from '../types/config';

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
      this.setDefaults(parsedConfig);
      
      return parsedConfig as BotConfig;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse config file ${configPath}: ${error.message}`);
      }
      throw error;
    }
  }

  private static validateConfig(config: Record<string, unknown>): void {
    // Validate accounts section
    const accounts = config.accounts as Array<Record<string, unknown>> | undefined;
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      throw new Error('Missing or empty accounts array in config. At least one account must be configured.');
    }

    // Validate each account
    const accountNames = new Set<string>();
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      
      if (!account.name || typeof account.name !== 'string') {
        throw new Error(`Account ${i + 1}: Missing or invalid name`);
      }
      
      if (accountNames.has(account.name as string)) {
        throw new Error(`Duplicate account name: "${account.name}"`);
      }
      accountNames.add(account.name as string);
      
      if (!account.instance || typeof account.instance !== 'string') {
        throw new Error(`Account "${account.name}": Missing or invalid instance`);
      }
      
      if (!account.accessToken || typeof account.accessToken !== 'string') {
        throw new Error(`Account "${account.name}": Missing or invalid accessToken`);
      }
    }

    // Validate bot section
    const bot = config.bot as Record<string, unknown> | undefined;
    if (!bot) {
      throw new Error('Missing [bot] section in config');
    }

    if (!bot.providers || !Array.isArray(bot.providers) || bot.providers.length === 0) {
      throw new Error('Missing or empty bot.providers array in config. At least one provider must be configured.');
    }

    // Validate each provider
    for (let i = 0; i < bot.providers.length; i++) {
      const provider = bot.providers[i] as Record<string, unknown>;
      
      if (!provider.name || typeof provider.name !== 'string') {
        throw new Error(`Provider ${i + 1}: Missing or invalid name`);
      }
      
      if (!provider.accounts || !Array.isArray(provider.accounts) || provider.accounts.length === 0) {
        throw new Error(`Provider "${provider.name}": Missing or empty accounts array`);
      }
      
      // Validate that all referenced accounts exist
      for (const accountName of provider.accounts as string[]) {
        if (!accountNames.has(accountName)) {
          throw new Error(`Provider "${provider.name}" references unknown account: "${accountName}"`);
        }
      }
    }

    // Validate logging section
    const logging = config.logging as Record<string, unknown> | undefined;
    if (!logging) {
      throw new Error('Missing [logging] section in config');
    }

    // Set defaults
    logging.level = logging.level || 'info';
  }

  private static setDefaults(config: Record<string, unknown>): void {
    // Set telemetry defaults if not present
    if (!config.telemetry) {
      config.telemetry = this.getDefaultTelemetryConfig();
    } else {
      const telemetry = config.telemetry as Record<string, unknown>;
      const defaults = this.getDefaultTelemetryConfig();
      
      // Merge with defaults
      Object.keys(defaults).forEach(key => {
        if (telemetry[key] === undefined) {
          telemetry[key] = (defaults as unknown as Record<string, unknown>)[key];
        }
      });

      // Set nested defaults
      if (telemetry.jaeger && typeof telemetry.jaeger === 'object') {
        const jaeger = telemetry.jaeger as Record<string, unknown>;
        jaeger.enabled = jaeger.enabled ?? false;
        jaeger.endpoint = jaeger.endpoint ?? 'http://localhost:14268/api/traces';
      }

      if (telemetry.prometheus && typeof telemetry.prometheus === 'object') {
        const prometheus = telemetry.prometheus as Record<string, unknown>;
        prometheus.enabled = prometheus.enabled ?? false;
        prometheus.port = prometheus.port ?? 9090;
        prometheus.endpoint = prometheus.endpoint ?? '/metrics';
      }

      if (telemetry.tracing && typeof telemetry.tracing === 'object') {
        const tracing = telemetry.tracing as Record<string, unknown>;
        tracing.enabled = tracing.enabled ?? false;
      }

      if (telemetry.metrics && typeof telemetry.metrics === 'object') {
        const metrics = telemetry.metrics as Record<string, unknown>;
        metrics.enabled = metrics.enabled ?? false;
      }
    }
  }

  private static getDefaultTelemetryConfig(): TelemetryConfig {
    return {
      enabled: false,
      serviceName: 'buntspecht',
      serviceVersion: '0.4.0',
      jaeger: {
        enabled: false,
        endpoint: 'http://localhost:14268/api/traces',
      },
      prometheus: {
        enabled: false,
        port: 9090,
        endpoint: '/metrics',
      },
      tracing: {
        enabled: false,
      },
      metrics: {
        enabled: false,
      },
    };
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
