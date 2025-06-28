import { ConfigLoader } from './config/configLoader';
import { MastodonClient } from './services/mastodonClient';
import { MultiProviderScheduler } from './services/multiProviderScheduler';
import { Logger } from './utils/logger';
import { BotConfig, CliOptions } from './types/config';

export class MastodonPingBot {
  private config: BotConfig;
  private logger: Logger;
  private mastodonClient: MastodonClient;
  private scheduler: MultiProviderScheduler;

  constructor(cliOptions: CliOptions) {
    this.config = ConfigLoader.loadConfig(cliOptions);
    this.logger = new Logger(this.config.logging.level);
    this.mastodonClient = new MastodonClient(this.config, this.logger);
    this.scheduler = new MultiProviderScheduler(this.mastodonClient, this.config, this.logger);
  }

  /**
   * Initializes the bot and verifies the connection
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Buntspecht...');
    
    const isConnected = await this.mastodonClient.verifyConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to Mastodon. Please check your configuration.');
    }

    // Initialize the scheduler with message provider
    await this.scheduler.initialize();

    this.logger.info('Bot initialized successfully');
  }

  /**
   * Starts the bot scheduler
   */
  public async start(): Promise<void> {
    this.logger.info('Starting Buntspecht...');
    await this.scheduler.start();
  }

  /**
   * Stops the bot scheduler
   */
  public stop(): void {
    this.logger.info('Stopping Buntspecht...');
    this.scheduler.stop();
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
    const shutdown = (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      this.stop();
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
}