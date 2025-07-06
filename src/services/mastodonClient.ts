import { createRestAPIClient, type mastodon } from 'masto';
import { BotConfig, AccountConfig } from '../types/config';
import { Logger } from '../utils/logger';
import type { TelemetryService } from './telemetryInterface';

interface AccountClient {
  name: string;
  config: AccountConfig;
  client: mastodon.rest.Client;
}

export class MastodonClient {
  private clients: Map<string, AccountClient> = new Map();
  private config: BotConfig;
  private logger: Logger;
  private telemetry: TelemetryService;

  constructor(config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    this.config = config;
    this.logger = logger;
    this.telemetry = telemetry;
    this.initializeClients();
  }

  private initializeClients(): void {
    for (const accountConfig of this.config.accounts) {
      // Only initialize Mastodon accounts (default type or explicitly set to mastodon)
      const accountType = accountConfig.type || 'mastodon';
      if (accountType !== 'mastodon') {
        continue; // Skip non-Mastodon accounts
      }

      if (!accountConfig.instance || !accountConfig.accessToken) {
        this.logger.error(`Mastodon account "${accountConfig.name}" missing required instance or accessToken`);
        continue;
      }

      const client = createRestAPIClient({
        url: accountConfig.instance,
        accessToken: accountConfig.accessToken,
      });

      this.clients.set(accountConfig.name, {
        name: accountConfig.name,
        config: accountConfig,
        client,
      });

      this.logger.debug(`Initialized Mastodon client for account: ${accountConfig.name} (${accountConfig.instance})`);
    }
  }

  /**
   * Posts a status message to specified accounts
   */
  public async postStatus(message: string, accountNames: string[], provider?: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): Promise<void> {
    const span = this.telemetry.startSpan('mastodon.post_status', {
      'mastodon.accounts_count': accountNames.length,
      'mastodon.provider': provider || 'unknown',
      'mastodon.message_length': message.length,
    });

    try {
      if (accountNames.length === 0) {
        throw new Error('No accounts specified for posting');
      }

      const results: Array<{ account: string; success: boolean; error?: string }> = [];

      for (const accountName of accountNames) {
        const accountClient = this.clients.get(accountName);
        if (!accountClient) {
          const error = `Account "${accountName}" not found in configuration`;
          this.logger.error(error);
          this.telemetry.recordError('account_not_found', provider, accountName);
          results.push({ account: accountName, success: false, error });
          continue;
        }

        try {
          // Determine visibility: parameter > account default > global default (unlisted)
          const finalVisibility = visibility || accountClient.config.defaultVisibility || 'unlisted';
          
          this.logger.info(`Posting status to ${accountName} (${accountClient.config.instance || 'unknown'}) with visibility '${finalVisibility}' (${message.length} chars): "${message}"`);
          
          const status = await accountClient.client.v1.statuses.create({
            status: message,
            visibility: finalVisibility,
          });

          this.logger.info(`Status posted successfully to ${accountName}. ID: ${status.id}`);
          this.telemetry.recordPost(accountName, provider || 'unknown');
          results.push({ account: accountName, success: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to post status to ${accountName}:`, error);
          this.telemetry.recordError('post_failed', provider, accountName);
          results.push({ account: accountName, success: false, error: errorMessage });
        }
      }

      // Check if any posts were successful
      const successfulPosts = results.filter(r => r.success);
      const failedPosts = results.filter(r => !r.success);

      if (successfulPosts.length === 0) {
        // All posts failed
        const errors = failedPosts.map(r => `${r.account}: ${r.error}`).join(', ');
        span?.setStatus({ code: 2, message: 'All posts failed' }); // ERROR
        throw new Error(`Failed to post to all accounts: ${errors}`);
      } else if (failedPosts.length > 0) {
        // Some posts failed, log warning but don't throw
        const errors = failedPosts.map(r => `${r.account}: ${r.error}`).join(', ');
        this.logger.warn(`Some posts failed: ${errors}`);
        span?.setStatus({ code: 1, message: 'Some posts failed' }); // WARNING
      } else {
        span?.setStatus({ code: 1 }); // OK
      }
    } catch (error) {
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Verifies the connection to all configured accounts
   */
  public async verifyConnection(): Promise<boolean> {
    if (this.clients.size === 0) {
      this.logger.error('No accounts configured');
      return false;
    }

    let allSuccessful = true;

    for (const [accountName, accountClient] of this.clients) {
      try {
        this.logger.debug(`Verifying connection for account: ${accountName}...`);
        
        const account = await accountClient.client.v1.accounts.verifyCredentials();
        
        this.logger.info(`Connected to ${accountName} as: @${account.username}@${new URL(accountClient.config.instance || 'https://mastodon.social').hostname}`);
      } catch (error) {
        this.logger.error(`Failed to verify connection for ${accountName}:`, error);
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * Gets account information for a specific account
   */
  public async getAccountInfo(accountName: string): Promise<mastodon.v1.Account> {
    const accountClient = this.clients.get(accountName);
    if (!accountClient) {
      throw new Error(`Account "${accountName}" not found in configuration`);
    }

    try {
      const account = await accountClient.client.v1.accounts.verifyCredentials();
      return account;
    } catch (error) {
      this.logger.error(`Failed to get account info for ${accountName}:`, error);
      throw new Error(`Failed to get account info for ${accountName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets account information for all configured accounts
   */
  public async getAllAccountsInfo(): Promise<Array<{ accountName: string; account: mastodon.v1.Account; instance: string }>> {
    const accountsInfo: Array<{ accountName: string; account: mastodon.v1.Account; instance: string }> = [];

    for (const [accountName, accountClient] of this.clients) {
      try {
        const account = await accountClient.client.v1.accounts.verifyCredentials();
        accountsInfo.push({
          accountName,
          account,
          instance: accountClient.config.instance || 'unknown'
        });
      } catch (error) {
        this.logger.error(`Failed to get account info for ${accountName}:`, error);
        // Continue with other accounts even if one fails
      }
    }

    return accountsInfo;
  }

  /**
   * Gets the list of configured account names
   */
  public getAccountNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Checks if an account exists in the configuration
   */
  public hasAccount(accountName: string): boolean {
    return this.clients.has(accountName);
  }
}