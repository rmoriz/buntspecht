import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';
import { BotConfig, CliOptions, TelemetryConfig, AccountConfig } from '../types/config';
import { SecretResolver } from '../services/secretResolver';
import { Logger } from '../utils/logger';
import * as packageJson from '../../package.json';

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

    // Validate config file is readable
    this.validateConfigFileReadable(configPath);

    const config = this.parseConfigFile(configPath);
    
    // Validate cache files are writable
    this.validateCacheFilesWritable(config);

    return config;
  }

  /**
   * Loads configuration and resolves external secrets
   * This is an async version that resolves external secret sources
   */
  public static async loadConfigWithSecrets(cliOptions: CliOptions): Promise<BotConfig> {
    const config = this.loadConfig(cliOptions);
    
    // Create a temporary logger for secret resolution
    const logger = new Logger('info');
    const secretResolver = new SecretResolver(logger);
    
    // Resolve secrets for all accounts
    for (const account of config.accounts) {
      await this.resolveAccountSecrets(account, secretResolver);
    }
    
    return config;
  }

  /**
   * Resolve external secrets for a single account
   */
  private static async resolveAccountSecrets(account: AccountConfig, secretResolver: SecretResolver): Promise<void> {
    try {
      // Resolve accessToken
      const resolvedAccessToken = await secretResolver.resolveCredentialField(
        account.accessToken,
        account.accessTokenSource,
        'accessToken',
        account.name
      );
      if (resolvedAccessToken !== undefined) {
        account.accessToken = resolvedAccessToken;
        delete account.accessTokenSource; // Remove source after resolution
      }

      // Resolve identifier
      const resolvedIdentifier = await secretResolver.resolveCredentialField(
        account.identifier,
        account.identifierSource,
        'identifier',
        account.name
      );
      if (resolvedIdentifier !== undefined) {
        account.identifier = resolvedIdentifier;
        delete account.identifierSource; // Remove source after resolution
      }

      // Resolve password
      const resolvedPassword = await secretResolver.resolveCredentialField(
        account.password,
        account.passwordSource,
        'password',
        account.name
      );
      if (resolvedPassword !== undefined) {
        account.password = resolvedPassword;
        delete account.passwordSource; // Remove source after resolution
      }

      // Resolve instance (if needed)
      const resolvedInstance = await secretResolver.resolveCredentialField(
        account.instance,
        account.instanceSource,
        'instance',
        account.name
      );
      if (resolvedInstance !== undefined) {
        account.instance = resolvedInstance;
        delete account.instanceSource; // Remove source after resolution
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to resolve secrets for account "${account.name}": ${errorMessage}`);
    }
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
      
      this.setDefaults(parsedConfig);
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
      
      // Validate account type-specific requirements based on what each client actually uses
      const accountType = account.type || 'mastodon';
      
      if (accountType === 'bluesky') {
        // BlueskyClient requires: identifier and password (or their sources)
        this.validateCredentialField(account, 'identifier', 'identifierSource');
        this.validateCredentialField(account, 'password', 'passwordSource');
        
        // Instance is optional for Bluesky (defaults to https://bsky.social)
        if (account.instance && typeof account.instance !== 'string') {
          throw new Error(`Bluesky account "${account.name}": Invalid instance (must be a string)`);
        }
        if (account.instanceSource && typeof account.instanceSource !== 'string') {
          throw new Error(`Bluesky account "${account.name}": Invalid instanceSource (must be a string)`);
        }
        // Don't enforce accessToken for Bluesky accounts (not used by BlueskyClient)
      } else {
        // MastodonClient requires: instance and accessToken (or their sources)
        this.validateCredentialField(account, 'instance', 'instanceSource');
        this.validateCredentialField(account, 'accessToken', 'accessTokenSource');
        
        // Don't enforce identifier/password for Mastodon accounts (not used by MastodonClient)
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

    // Validate webhook section if present
    const webhook = config.webhook as Record<string, unknown> | undefined;
    if (webhook && webhook.enabled === true) {
      // Secret is now optional - just validate type if provided
      if (webhook.secret !== undefined && (typeof webhook.secret !== 'string' || webhook.secret.trim() === '')) {
        throw new Error('Webhook secret must be a non-empty string if provided.');
      }
      
      if (!webhook.port || typeof webhook.port !== 'number' || webhook.port < 1 || webhook.port > 65535) {
        throw new Error('Invalid webhook port. Must be a number between 1 and 65535.');
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

  /**
   * Validates that a credential field has either a direct value or a source, but not both
   */
  private static validateCredentialField(
    account: Record<string, unknown>, 
    fieldName: string, 
    sourceFieldName: string
  ): void {
    const directValue = account[fieldName];
    const sourceValue = account[sourceFieldName];
    
    // Check if both are provided
    if (directValue && sourceValue) {
      throw new Error(
        `Account "${account.name}": Cannot specify both ${fieldName} and ${sourceFieldName}`
      );
    }
    
    // Check if neither is provided
    if (!directValue && !sourceValue) {
      throw new Error(
        `Account "${account.name}": Must specify either ${fieldName} or ${sourceFieldName}`
      );
    }
    
    // Validate types if values are present
    if (directValue && typeof directValue !== 'string') {
      throw new Error(`Account "${account.name}": Invalid ${fieldName} (must be a string)`);
    }
    
    if (sourceValue && typeof sourceValue !== 'string') {
      throw new Error(`Account "${account.name}": Invalid ${sourceFieldName} (must be a string)`);
    }
  }

  private static setDefaults(config: Record<string, unknown>): void {
    // Set account defaults
    const accounts = config.accounts as Array<Record<string, unknown>>;
    if (accounts && Array.isArray(accounts)) {
      for (const account of accounts) {
        // Set default account type to 'mastodon' if not specified
        if (!account.type) {
          account.type = 'mastodon';
        }
      }
    }

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
      serviceVersion: packageJson.version,
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
   * Validates that the config file is readable
   */
  private static validateConfigFileReadable(configPath: string): void {
    try {
      fs.accessSync(configPath, fs.constants.R_OK);
    } catch {
      throw new Error(`Configuration file is not readable: ${configPath}. Please check file permissions.`);
    }
  }

  /**
   * Validates that cache files specified in provider configurations are writable
   */
  private static validateCacheFilesWritable(config: BotConfig): void {
    const cacheFilePaths = new Set<string>();
    
    // Extract cache file paths from providers
    for (const provider of config.bot.providers) {
      if (provider.type === 'multijsoncommand' && provider.config.cache) {
        const cacheConfig = provider.config.cache as { filePath?: string };
        if (cacheConfig.filePath) {
          cacheFilePaths.add(cacheConfig.filePath);
        } else {
          // Add default cache file path
          cacheFilePaths.add('./cache/multijson-cache.json');
        }
      }
    }

    // Validate each unique cache file path
    for (const cacheFilePath of cacheFilePaths) {
      this.validateCacheFileWritable(cacheFilePath);
    }
  }

  /**
   * Validates that a cache file path is writable
   */
  private static validateCacheFileWritable(cacheFilePath: string): void {
    const resolvedPath = path.resolve(cacheFilePath);
    const cacheDir = path.dirname(resolvedPath);
    
    // Ensure cache directory exists
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
    } catch {
      throw new Error(`Cannot create cache directory: ${cacheDir}. Please check directory permissions.`);
    }

    // Check if cache file exists and is writable, or if directory is writable for new files
    if (fs.existsSync(resolvedPath)) {
      try {
        fs.accessSync(resolvedPath, fs.constants.W_OK);
      } catch {
        throw new Error(`Cache file is not writable: ${resolvedPath}. Please check file permissions.`);
      }
    } else {
      // File doesn't exist, check if we can write to the directory
      try {
        fs.accessSync(cacheDir, fs.constants.W_OK);
      } catch {
        throw new Error(`Cache directory is not writable: ${cacheDir}. Please check directory permissions.`);
      }
      
      // Test write by creating and immediately deleting a temporary file
      const testFile = path.join(cacheDir, '.buntspecht_write_test');
      try {
        fs.writeFileSync(testFile, '');
        fs.unlinkSync(testFile);
      } catch {
        throw new Error(`Cannot write to cache directory: ${cacheDir}. Please check directory permissions.`);
      }
    }
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
