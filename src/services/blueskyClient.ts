import { BskyAgent } from '@atproto/api';
import { BotConfig, AccountConfig } from '../types/config';
import { Logger } from '../utils/logger';
import type { TelemetryService } from './telemetryInterface';

interface BlueskyAccountClient {
  name: string;
  config: AccountConfig;
  agent: BskyAgent;
}

export class BlueskyClient {
  private clients: Map<string, BlueskyAccountClient> = new Map();
  private config: BotConfig;
  private logger: Logger;
  private telemetry: TelemetryService;

  constructor(config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    this.config = config;
    this.logger = logger;
    this.telemetry = telemetry;
    this.initializeClients();
  }

  private async initializeClients(): Promise<void> {
    for (const accountConfig of this.config.accounts) {
      if (accountConfig.type === 'bluesky') {
        try {
          const agent = new BskyAgent({
            service: accountConfig.instance || 'https://bsky.social',
          });

          // Authenticate with Bluesky
          if (accountConfig.identifier && accountConfig.password) {
            await agent.login({
              identifier: accountConfig.identifier,
              password: accountConfig.password,
            });
          } else if (accountConfig.accessToken) {
            // Use access token if available (for future OAuth support)
            // Note: This is a placeholder for future OAuth implementation
            // Currently, we'll skip this and require identifier+password
            this.logger.warn(`Access token authentication not yet implemented for Bluesky account "${accountConfig.name}". Please use identifier+password.`);
            continue;
          } else {
            throw new Error(`Bluesky account "${accountConfig.name}" requires either identifier+password or accessToken`);
          }

          this.clients.set(accountConfig.name, {
            name: accountConfig.name,
            config: accountConfig,
            agent,
          });

          this.logger.debug(`Initialized Bluesky client for account: ${accountConfig.name} (${accountConfig.instance || 'https://bsky.social'})`);
        } catch (error) {
          this.logger.error(`Failed to initialize Bluesky client for ${accountConfig.name}:`, error);
        }
      }
    }
  }

  /**
   * Posts a status message to specified Bluesky accounts
   */
  public async postStatus(message: string, accountNames: string[], provider?: string): Promise<void> {
    const span = this.telemetry.startSpan('bluesky.post_status', {
      'bluesky.accounts_count': accountNames.length,
      'bluesky.provider': provider || 'unknown',
      'bluesky.message_length': message.length,
    });

    try {
      if (accountNames.length === 0) {
        throw new Error('No accounts specified for posting');
      }

      const results: Array<{ account: string; success: boolean; error?: string }> = [];

      for (const accountName of accountNames) {
        const accountClient = this.clients.get(accountName);
        if (!accountClient) {
          const error = `Bluesky account "${accountName}" not found in configuration`;
          this.logger.error(error);
          this.telemetry.recordError('account_not_found', provider, accountName);
          results.push({ account: accountName, success: false, error });
          continue;
        }

        try {
          this.logger.info(`Posting status to Bluesky ${accountName} (${accountClient.config.instance || 'https://bsky.social'}) (${message.length} chars): "${message}"`);
          
          const response = await accountClient.agent.post({
            text: message,
            createdAt: new Date().toISOString(),
          });

          this.logger.info(`Status posted successfully to Bluesky ${accountName}. URI: ${response.uri}`);
          this.telemetry.recordPost(accountName, provider || 'unknown');
          results.push({ account: accountName, success: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to post status to Bluesky ${accountName}:`, error);
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
        throw new Error(`Failed to post to all Bluesky accounts: ${errors}`);
      } else if (failedPosts.length > 0) {
        // Some posts failed, log warning but don't throw
        const errors = failedPosts.map(r => `${r.account}: ${r.error}`).join(', ');
        this.logger.warn(`Some Bluesky posts failed: ${errors}`);
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
   * Verifies the connection to all configured Bluesky accounts
   */
  public async verifyConnection(): Promise<boolean> {
    if (this.clients.size === 0) {
      this.logger.debug('No Bluesky accounts configured');
      return true; // Not an error if no Bluesky accounts
    }

    let allSuccessful = true;

    for (const [accountName, accountClient] of this.clients) {
      try {
        this.logger.debug(`Verifying Bluesky connection for account: ${accountName}...`);
        
        const profile = await accountClient.agent.getProfile({
          actor: accountClient.agent.session?.handle || accountClient.config.identifier || '',
        });
        
        this.logger.info(`Connected to Bluesky ${accountName} as: @${profile.data.handle}`);
      } catch (error) {
        this.logger.error(`Failed to verify Bluesky connection for ${accountName}:`, error);
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  /**
   * Gets account information for a specific Bluesky account
   */
  public async getAccountInfo(accountName: string): Promise<unknown> {
    const accountClient = this.clients.get(accountName);
    if (!accountClient) {
      throw new Error(`Bluesky account "${accountName}" not found in configuration`);
    }

    try {
      const profile = await accountClient.agent.getProfile({
        actor: accountClient.agent.session?.handle || accountClient.config.identifier || '',
      });
      return profile.data;
    } catch (error) {
      this.logger.error(`Failed to get Bluesky account info for ${accountName}:`, error);
      throw new Error(`Failed to get Bluesky account info for ${accountName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets account information for all configured Bluesky accounts
   */
  public async getAllAccountsInfo(): Promise<Array<{ accountName: string; account: unknown; instance: string }>> {
    const accountsInfo: Array<{ accountName: string; account: unknown; instance: string }> = [];

    for (const [accountName, accountClient] of this.clients) {
      try {
        const profile = await accountClient.agent.getProfile({
          actor: accountClient.agent.session?.handle || accountClient.config.identifier || '',
        });
        accountsInfo.push({
          accountName,
          account: profile.data as unknown,
          instance: accountClient.config.instance || 'https://bsky.social'
        });
      } catch (error) {
        this.logger.error(`Failed to get Bluesky account info for ${accountName}:`, error);
        // Continue with other accounts even if one fails
      }
    }

    return accountsInfo;
  }

  /**
   * Gets the list of configured Bluesky account names
   */
  public getAccountNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Checks if a Bluesky account exists in the configuration
   */
  public hasAccount(accountName: string): boolean {
    return this.clients.has(accountName);
  }
}