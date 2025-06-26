import Mastodon from 'mastodon-api';
import { BotConfig } from '../types/config';
import { Logger } from '../utils/logger';

export class MastodonClient {
  private client: any;
  private config: BotConfig;
  private logger: Logger;

  constructor(config: BotConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.initializeClient();
  }

  private initializeClient(): void {
    this.client = new Mastodon({
      access_token: this.config.mastodon.accessToken,
      api_url: `${this.config.mastodon.instance}/api/v1/`,
    });
  }

  /**
   * Posts a status message to Mastodon
   */
  public async postStatus(message: string): Promise<void> {
    try {
      this.logger.info(`Posting status: "${message}"`);
      
      const response = await this.client.post('statuses', {
        status: message,
      });

      this.logger.info(`Status posted successfully. ID: ${response.data.id}`);
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
      
      const response = await this.client.get('accounts/verify_credentials');
      
      this.logger.info(`Connected to Mastodon as: @${response.data.username}@${new URL(this.config.mastodon.instance).hostname}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to verify Mastodon connection:', error);
      return false;
    }
  }

  /**
   * Gets the current user's account information
   */
  public async getAccountInfo(): Promise<any> {
    try {
      const response = await this.client.get('accounts/verify_credentials');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get account info:', error);
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}