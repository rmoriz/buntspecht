import { BotConfig } from '../types/config';
import { Logger } from '../utils/logger';
import type { TelemetryService } from './telemetryInterface';
import { MastodonClient } from './mastodonClient';
import { BlueskyClient } from './blueskyClient';
import { BaseConfigurableService } from './baseService';

/**
 * Unified social media client that handles multiple platforms
 */
export class SocialMediaClient extends BaseConfigurableService<BotConfig> {
  private mastodonClient: MastodonClient;
  private blueskyClient: BlueskyClient;

  constructor(config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    super(config, logger, telemetry);
    
    this.mastodonClient = new MastodonClient(config, logger, telemetry);
    this.blueskyClient = new BlueskyClient(config, logger, telemetry);
  }

  /**
   * Posts a status message to specified accounts across all platforms
   */
  public async postStatus(message: string, accountNames: string[], provider?: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): Promise<void> {
    return this.postStatusWithAttachments({ text: message }, accountNames, provider, visibility);
  }

  /**
   * Posts a status message with attachments to specified accounts across all platforms
   */
  public async postStatusWithAttachments(messageData: { text: string; attachments?: Array<{ data: string; mimeType: string; filename?: string; description?: string }> }, accountNames: string[], provider?: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): Promise<void> {
    const span = this.telemetry.startSpan('social_media.post_status', {
      'social_media.accounts_count': accountNames.length,
      'social_media.provider': provider || 'unknown',
      'social_media.message_length': messageData.text.length,
      'social_media.attachments_count': messageData.attachments?.length || 0,
    });

    try {
      if (accountNames.length === 0) {
        throw new Error('No accounts specified for posting');
      }

      // Separate accounts by platform
      const mastodonAccounts: string[] = [];
      const blueskyAccounts: string[] = [];

      for (const accountName of accountNames) {
        const account = this.config.accounts.find(acc => acc.name === accountName);
        if (!account) {
          this.logger.warn(`Account "${accountName}" not found in configuration`);
          continue;
        }

        if (account.type === 'bluesky') {
          blueskyAccounts.push(accountName);
        } else {
          // Default to mastodon for backward compatibility
          mastodonAccounts.push(accountName);
        }
      }

      const promises: Promise<void>[] = [];

      // Post to Mastodon accounts
      if (mastodonAccounts.length > 0) {
        promises.push(this.mastodonClient.postStatusWithAttachments(messageData, mastodonAccounts, provider, visibility));
      }

      // Post to Bluesky accounts
      if (blueskyAccounts.length > 0) {
        promises.push(this.blueskyClient.postStatusWithAttachments(messageData, blueskyAccounts, provider));
      }

      // Wait for all posts to complete
      await Promise.all(promises);

      span?.setStatus({ code: 1 }); // OK
    } catch (error) {
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Verifies the connection to all configured accounts across all platforms
   */
  public async verifyConnection(): Promise<boolean> {
    const mastodonResult = await this.mastodonClient.verifyConnection();
    const blueskyResult = await this.blueskyClient.verifyConnection();
    
    return mastodonResult && blueskyResult;
  }

  /**
   * Gets account information for a specific account
   */
  public async getAccountInfo(accountName: string): Promise<unknown> {
    const account = this.config.accounts.find(acc => acc.name === accountName);
    if (!account) {
      throw new Error(`Account "${accountName}" not found in configuration`);
    }

    if (account.type === 'bluesky') {
      return await this.blueskyClient.getAccountInfo(accountName);
    } else {
      return await this.mastodonClient.getAccountInfo(accountName);
    }
  }

  /**
   * Gets account information for all configured accounts across all platforms
   */
  public async getAllAccountsInfo(): Promise<Array<{ accountName: string; account: unknown; instance: string; platform: string }>> {
    const mastodonAccounts = await this.mastodonClient.getAllAccountsInfo();
    const blueskyAccounts = await this.blueskyClient.getAllAccountsInfo();

    const allAccounts = [
      ...mastodonAccounts.map(acc => ({ ...acc, platform: 'mastodon' })),
      ...blueskyAccounts.map(acc => ({ ...acc, platform: 'bluesky' }))
    ];

    return allAccounts;
  }

  /**
   * Gets the list of all configured account names
   */
  public getAccountNames(): string[] {
    return this.config.accounts.map(acc => acc.name);
  }

  /**
   * Checks if an account exists in the configuration
   */
  public hasAccount(accountName: string): boolean {
    return this.config.accounts.some(acc => acc.name === accountName);
  }

  /**
   * Gets the Mastodon client (for backward compatibility)
   */
  public getMastodonClient(): MastodonClient {
    return this.mastodonClient;
  }

  /**
   * Gets the Bluesky client
   */
  public getBlueskyClient(): BlueskyClient {
    return this.blueskyClient;
  }

  /**
   * Reinitialize a specific account after secret rotation
   */
  public async reinitializeAccount(account: any): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
    this.logger.info(`Reinitializing account: ${account.name}`);
    
    if (account.type === 'bluesky') {
      await this.blueskyClient.reinitializeAccount(account);
    } else {
      await this.mastodonClient.reinitializeAccount(account);
    }
    
    this.logger.info(`Successfully reinitialized account: ${account.name}`);
  }

  /**
   * Verify connection for a specific account
   */
  public async verifyAccountConnection(account: any): Promise<boolean> { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      if (account.type === 'bluesky') {
        return await this.blueskyClient.verifyAccountConnection(account);
      } else {
        return await this.mastodonClient.verifyAccountConnection(account);
      }
    } catch (error) {
      this.logger.error(`Failed to verify connection for account ${account.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Purges old posts from Mastodon accounts based on their purging configuration
   * Note: This only works for Mastodon accounts, Bluesky accounts are ignored
   */
  public async purgeOldPosts(accountNames?: string[]): Promise<void> {
    this.logger.info('Starting post purge operation...');
    
    // Only purge Mastodon accounts since Bluesky doesn't support post deletion via API in the same way
    await this.mastodonClient.purgeOldPosts(accountNames);
    
    this.logger.info('Post purge operation completed');
  }
}