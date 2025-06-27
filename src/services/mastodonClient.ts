import { createRestAPIClient, type mastodon } from 'masto';
import { BotConfig } from '../types/config';
import { Logger } from '../utils/logger';

export class MastodonClient {
  private client!: mastodon.rest.Client;
  private config: BotConfig;
  private logger: Logger;

  constructor(config: BotConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.initializeClient();
  }

  private initializeClient(): void {
    this.client = createRestAPIClient({
      url: this.config.mastodon.instance,
      accessToken: this.config.mastodon.accessToken,
    });
  }

  /**
   * Posts a status message to Mastodon
   */
  public async postStatus(message: string): Promise<void> {
    try {
      this.logger.info(`Posting status: "${message}"`);
      
      const status = await this.client.v1.statuses.create({
        status: message,
      });

      this.logger.info(`Status posted successfully. ID: ${status.id}`);
    } catch (error) {
      this.logger.error('Failed to post status:', error);
      throw new Error(`Failed to post status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verifies the connection to Mastodon by fetching account info
   */
  public async verifyConnection(): Promise<boolean> {
    try {
      this.logger.debug('Verifying Mastodon connection...');
      
      const account = await this.client.v1.accounts.verifyCredentials();
      
      this.logger.info(`Connected to Mastodon as: @${account.username}@${new URL(this.config.mastodon.instance).hostname}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to verify Mastodon connection:', error);
      return false;
    }
  }

  /**
   * Gets the current user's account information
   */
  public async getAccountInfo(): Promise<mastodon.v1.Account> {
    try {
      const account = await this.client.v1.accounts.verifyCredentials();
      return account;
    } catch (error) {
      this.logger.error('Failed to get account info:', error);
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}