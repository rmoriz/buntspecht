import { ConfigLoader } from './config/configLoader';
import { MastodonClient } from './services/mastodonClient';
import { MultiProviderScheduler } from './services/multiProviderScheduler';
import { WebhookServer } from './services/webhookServer';
import { createTelemetryService } from './services/telemetryFactory';
import { Logger } from './utils/logger';
import { BotConfig, CliOptions } from './types/config';

export class MastodonPingBot {
  private config: BotConfig;
  private logger: Logger;
  private telemetry: any; // Will be set in initialize()
  private mastodonClient!: MastodonClient; // Initialized in initialize()
  private scheduler!: MultiProviderScheduler; // Initialized in initialize()
  private webhookServer?: WebhookServer; // Optional webhook server

  constructor(cliOptions: CliOptions) {
    this.config = ConfigLoader.loadConfig(cliOptions);
    this.logger = new Logger(this.config.logging.level);
    // Telemetry will be initialized in initialize() method
  }

  /**
   * Initializes the bot and verifies the connection
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Buntspecht...');
    
    // Initialize telemetry first
    this.telemetry = await createTelemetryService(this.config.telemetry!, this.logger);
    await this.telemetry.initialize();
    
    // Initialize other services with telemetry
    this.mastodonClient = new MastodonClient(this.config, this.logger, this.telemetry);
    this.scheduler = new MultiProviderScheduler(this.mastodonClient, this.config, this.logger, this.telemetry);
    
    // Initialize webhook server if configured
    if (this.config.webhook?.enabled) {
      this.webhookServer = new WebhookServer(this.config.webhook, this, this.logger, this.telemetry);
    }
    
    const isConnected = await this.mastodonClient.verifyConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to Mastodon. Please check your configuration.');
    }

    // Initialize the scheduler with message provider
    await this.scheduler.initialize();

    this.logger.info('Bot initialized successfully');
  }

  /**
   * Starts the bot scheduler and webhook server
   */
  public async start(): Promise<void> {
    this.logger.info('Starting Buntspecht...');
    await this.scheduler.start();
    
    // Start webhook server if configured
    if (this.webhookServer) {
      await this.webhookServer.start();
    }
  }

  /**
   * Stops the bot scheduler and webhook server
   */
  public async stop(): Promise<void> {
    this.logger.info('Stopping Buntspecht...');
    this.scheduler.stop();
    
    // Stop webhook server if running
    if (this.webhookServer) {
      await this.webhookServer.stop();
    }
    
    await this.telemetry.shutdown();
  }

  /**
   * Posts a test message immediately
   */
  public async testPost(): Promise<void> {
    this.logger.info('Posting test message...');
    await this.scheduler.executeAllTasksNow();
  }

  /**
   * Verifies the connection and displays account info
   */
  public async verify(): Promise<void> {
    this.logger.info('Verifying connections...');
    
    const isConnected = await this.mastodonClient.verifyConnection();
    if (!isConnected) {
      throw new Error('Connection verification failed for one or more accounts');
    }

    const accountsInfo = await this.mastodonClient.getAllAccountsInfo();
    this.logger.info(`Successfully verified ${accountsInfo.length} account(s):`);
    
    for (const { accountName, account, instance } of accountsInfo) {
      this.logger.info(`  ${accountName}: @${account.username}@${new URL(instance).hostname}`);
      this.logger.info(`    Display Name: ${account.displayName}`);
      this.logger.info(`    Followers: ${account.followersCount}, Following: ${account.followingCount}`);
    }
    
    this.logger.info('All connections verified successfully');
  }

  /**
   * Graceful shutdown handler
   */
  public setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): BotConfig {
    return this.config;
  }

  /**
   * Gets the logger instance
   */
  public getLogger(): Logger {
    return this.logger;
  }

  /**
   * Gets information about configured providers
   */
  public getProviderInfo(): Array<{name: string, type: string, schedule: string, enabled: boolean}> {
    return this.scheduler.getProviderInfo();
  }

  /**
   * Posts a test message from a specific provider
   */
  public async testPostFromProvider(providerName: string): Promise<void> {
    this.logger.info(`Posting test message from provider: ${providerName}`);
    await this.scheduler.executeProviderTaskNow(providerName);
  }

  /**
   * Returns whether the bot is using multi-provider mode (always true now)
   */
  public isMultiProviderMode(): boolean {
    return true;
  }

  /**
   * Triggers a push provider with an optional custom message
   */
  public async triggerPushProvider(providerName: string, message?: string): Promise<void> {
    this.logger.info(`Triggering push provider: ${providerName}${message ? ' with custom message' : ''}`);
    await this.scheduler.triggerPushProvider(providerName, message);
  }

  /**
   * Gets all configured push providers
   */
  public getPushProviders(): Array<{name: string, config: any}> {
    return this.scheduler.getPushProviders();
  }

  /**
   * Checks if a provider is a push provider
   */
  public isPushProvider(providerName: string): boolean {
    return this.scheduler.isPushProvider(providerName);
  }

  /**
   * Gets webhook server status and configuration
   */
  public getWebhookInfo(): { enabled: boolean; running: boolean; config?: any } {
    return {
      enabled: !!this.config.webhook?.enabled,
      running: this.webhookServer?.isServerRunning() || false,
      config: this.webhookServer?.getConfig()
    };
  }

  /**
   * Checks if webhook server is enabled
   */
  public isWebhookEnabled(): boolean {
    return !!this.config.webhook?.enabled;
  }

  /**
   * Checks if webhook server is running
   */
  public isWebhookRunning(): boolean {
    return this.webhookServer?.isServerRunning() || false;
  }
}