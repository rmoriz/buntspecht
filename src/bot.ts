import { ConfigLoader } from './config/configLoader';
import { MastodonClient } from './services/mastodonClient';
import { BotScheduler } from './services/botScheduler';
import { Logger } from './utils/logger';
import { BotConfig, CliOptions } from './types/config';

export class MastodonPingBot {
  private config: BotConfig;
  private logger: Logger;
  private mastodonClient: MastodonClient;
  private scheduler: BotScheduler;

  constructor(cliOptions: CliOptions) {
    this.config = ConfigLoader.loadConfig(cliOptions);
    this.logger = new Logger(this.config.logging.level);
    this.mastodonClient = new MastodonClient(this.config, this.logger);
    this.scheduler = new BotScheduler(this.mastodonClient, this.config, this.logger);
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

    this.logger.info('Bot initialized successfully');
  }

  /**
   * Starts the bot scheduler
   */
  public start(): void {
    this.logger.info('Starting Buntspecht...');
    this.scheduler.start();
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
    await this.scheduler.executeTaskNow();
  }

  /**
   * Verifies the connection and displays account info
   */
  public async verify(): Promise<void> {
    this.logger.info('Verifying connection...');
    
    const isConnected = await this.mastodonClient.verifyConnection();
    if (!isConnected) {
      throw new Error('Connection verification failed');
    }

    const accountInfo = await this.mastodonClient.getAccountInfo();
    this.logger.info(`Account: @${accountInfo.username}`);
    this.logger.info(`Display Name: ${accountInfo.displayName}`);
    this.logger.info(`Followers: ${accountInfo.followersCount}`);
    this.logger.info(`Following: ${accountInfo.followingCount}`);
    this.logger.info('Connection verified successfully');
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
}