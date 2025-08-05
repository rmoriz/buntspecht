import { createRestAPIClient, type mastodon } from 'masto';
import { BotConfig, AccountConfig } from '../types/config';
import { Logger } from '../utils/logger';
import type { TelemetryService } from './telemetryInterface';
import { TelemetryHelper } from '../utils/telemetryHelper';
import { BaseConfigurableService } from './baseService';

interface AccountClient {
  name: string;
  config: AccountConfig;
  client: mastodon.rest.Client;
}

export class MastodonClient extends BaseConfigurableService<BotConfig> {
  private clients: Map<string, AccountClient> = new Map();

  constructor(config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    super(config, logger, telemetry);
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
    return this.postStatusWithAttachments({ text: message }, accountNames, provider, visibility);
  }

  /**
   * Posts a status message with attachments to specified accounts
   */
  public async postStatusWithAttachments(messageData: { text: string; attachments?: Array<{ data: string; mimeType: string; filename?: string; description?: string }> }, accountNames: string[], provider?: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): Promise<void> {
    return await TelemetryHelper.executeWithSpan(
      this.telemetry,
      'mastodon.post_status',
      {
        'mastodon.accounts_count': accountNames.length,
        'mastodon.provider': provider || 'unknown',
        'mastodon.message_length': messageData.text.length,
        'mastodon.attachments_count': messageData.attachments?.length || 0,
      },
      () => this.executePostStatus(messageData, accountNames, provider, visibility)
    );
  }

  /**
   * Internal method to execute status posting
   */
  private async executePostStatus(messageData: { text: string; attachments?: Array<{ data: string; mimeType: string; filename?: string; description?: string }> }, accountNames: string[], provider?: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): Promise<void> {
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
          
          this.logger.info(`Posting status to ${accountName} (${accountClient.config.instance || 'unknown'}) with visibility '${finalVisibility}' (${messageData.text.length} chars): "${messageData.text}"`);
          
          // Upload attachments if present
          const mediaIds: string[] = [];
          if (messageData.attachments && messageData.attachments.length > 0) {
            this.logger.info(`Uploading ${messageData.attachments.length} attachments to ${accountName}`);
            
            for (let i = 0; i < messageData.attachments.length; i++) {
              const attachment = messageData.attachments[i];
              try {
                // Convert base64 to buffer
                const buffer = Buffer.from(attachment.data, 'base64');
                
                // Create a File-like object for the upload
                const file = new File([buffer], attachment.filename || `attachment_${i + 1}`, {
                  type: attachment.mimeType,
                });
                
                const mediaAttachment = await accountClient.client.v2.media.create({
                  file,
                  description: attachment.description || undefined,  // Don't send empty strings to API
                });
                
                mediaIds.push(mediaAttachment.id);
                this.logger.debug(`Uploaded attachment ${i + 1} to ${accountName}: ${mediaAttachment.id}`);
              } catch (uploadError) {
                this.logger.error(`Failed to upload attachment ${i + 1} to ${accountName}:`, uploadError);
                // Continue with other attachments
              }
            }
          }
          
            const status = await accountClient.client.v1.statuses.create({
              status: messageData.text,
              visibility: finalVisibility,
              mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
              language: accountClient.config.language,
            });
          this.logger.info(`Status posted successfully to ${accountName}. ID: ${status.id}${mediaIds.length > 0 ? ` with ${mediaIds.length} attachments` : ''}`);
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
        throw new Error(`Failed to post to all accounts: ${errors}`);
      } else if (failedPosts.length > 0) {
        // Some posts failed, log warning but don't throw
        const errors = failedPosts.map(r => `${r.account}: ${r.error}`).join(', ');
        this.logger.warn(`Some posts failed: ${errors}`);
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

  /**
   * Reinitialize a specific account after secret rotation
   */
  public async reinitializeAccount(account: AccountConfig): Promise<void> {
    this.logger.info(`Reinitializing Mastodon account: ${account.name}`);

    if (!account.instance || !account.accessToken) {
      throw new Error(`Mastodon account "${account.name}" missing required instance or accessToken`);
    }

    // Create new client with updated credentials
    const client = createRestAPIClient({
      url: account.instance,
      accessToken: account.accessToken,
    });

    // Update the stored client
    this.clients.set(account.name, {
      name: account.name,
      config: account,
      client,
    });

    this.logger.info(`Successfully reinitialized Mastodon account: ${account.name}`);
  }

  /**
   * Verify connection for a specific account
   */
  public async verifyAccountConnection(account: AccountConfig): Promise<boolean> {
    try {
      const accountClient = this.clients.get(account.name);
      if (!accountClient) {
        this.logger.error(`Account "${account.name}" not found in clients`);
        return false;
      }

      const accountInfo = await accountClient.client.v1.accounts.verifyCredentials();
      this.logger.debug(`Successfully verified connection for Mastodon account: ${account.name} (@${accountInfo.username})`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to verify connection for Mastodon account ${account.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Purges old posts from specified accounts based on their purging configuration
   */
  public async purgeOldPosts(accountNames?: string[]): Promise<void> {
    const accountsToPurge = accountNames || Array.from(this.clients.keys());
    
    for (const accountName of accountsToPurge) {
      const accountClient = this.clients.get(accountName);
      if (!accountClient) {
        this.logger.warn(`Account "${accountName}" not found, skipping purge`);
        continue;
      }

      const purgeConfig = accountClient.config.purging;
      if (!purgeConfig?.enabled) {
        this.logger.debug(`Purging not enabled for account "${accountName}", skipping`);
        continue;
      }

      if (!purgeConfig.olderThanDays || purgeConfig.olderThanDays <= 0) {
        this.logger.warn(`Invalid olderThanDays configuration for account "${accountName}", skipping`);
        continue;
      }

      await this.purgeAccountPosts(accountClient, purgeConfig);
    }
  }

  /**
   * Purges old posts for a specific account
   */
  private async purgeAccountPosts(accountClient: AccountClient, purgeConfig: NonNullable<AccountConfig['purging']>): Promise<void> {
    const accountName = accountClient.name;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (purgeConfig.olderThanDays || 30));
    
    const preserveStarred = purgeConfig.preserveStarredPosts !== false;
    const preservePinned = purgeConfig.preservePinnedPosts !== false;
    const minStars = purgeConfig.minStarsToPreserve || 5;
    const dryRun = purgeConfig.dryRun || false;
    const batchSize = purgeConfig.batchSize || 20;
    const delayBetweenBatches = purgeConfig.delayBetweenBatches || 1000;

    this.logger.info(`Starting post purge for account "${accountName}": deleting posts older than ${cutoffDate.toISOString()} ${dryRun ? '(DRY RUN)' : ''}`);
    this.logger.info(`Purge settings: preserveStarred=${preserveStarred}, preservePinned=${preservePinned}, minStars=${minStars}`);

    try {
      // Get account info to retrieve account ID
      const accountInfo = await accountClient.client.v1.accounts.verifyCredentials();
      let deletedCount = 0;
      let skippedCount = 0;
      let processedCount = 0;
      let maxId: string | undefined;

      // Get pinned posts if we need to preserve them
      const pinnedPosts = preservePinned ? await this.getPinnedPosts(accountClient) : new Set<string>();

      while (true) {
        // Fetch user's statuses in batches
        const statuses = await accountClient.client.v1.accounts.$select(accountInfo.id).statuses.list({
          limit: batchSize,
          maxId: maxId,
          excludeReplies: false, // Include replies in purge consideration
          excludeReblogs: true,  // Don't include reblogs (can't delete others' posts anyway)
        });

        if (statuses.length === 0) {
          break; // No more posts to process
        }

        for (const status of statuses) {
          processedCount++;
          const postDate = new Date(status.createdAt);
          
          // Skip if post is newer than cutoff date
          if (postDate > cutoffDate) {
            skippedCount++;
            this.logger.debug(`Skipping recent post ${status.id} from ${postDate.toISOString()}`);
            continue;
          }

          // Skip if post is pinned and we're preserving pinned posts
          if (preservePinned && pinnedPosts.has(status.id)) {
            skippedCount++;
            this.logger.debug(`Skipping pinned post ${status.id}`);
            continue;
          }

          // Skip if post has enough stars and we're preserving starred posts
          if (preserveStarred && status.favouritesCount >= minStars) {
            skippedCount++;
            this.logger.debug(`Skipping starred post ${status.id} with ${status.favouritesCount} stars`);
            continue;
          }

          // Delete the post
          if (dryRun) {
            this.logger.info(`[DRY RUN] Would delete post ${status.id} from ${postDate.toISOString()} (${status.favouritesCount} stars)`);
            deletedCount++;
          } else {
            try {
              await accountClient.client.v1.statuses.$select(status.id).remove();
              deletedCount++;
              this.logger.debug(`Deleted post ${status.id} from ${postDate.toISOString()} (${status.favouritesCount} stars)`);
            } catch (deleteError) {
              this.logger.error(`Failed to delete post ${status.id}:`, deleteError);
              // Continue with other posts
            }
          }
        }

        // Update maxId for pagination
        if (statuses.length > 0) {
          maxId = statuses[statuses.length - 1].id;
        }

        // Add delay between batches to be respectful to the API
        if (delayBetweenBatches > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }

        // Log progress
        this.logger.info(`Processed ${processedCount} posts for "${accountName}": ${deletedCount} deleted, ${skippedCount} skipped`);
      }

      this.logger.info(`Completed post purge for account "${accountName}": ${deletedCount} posts ${dryRun ? 'would be ' : ''}deleted, ${skippedCount} posts preserved, ${processedCount} total posts processed`);
      
      // Record telemetry
      if (this.telemetry && typeof this.telemetry.recordCustomMetric === 'function') {
        this.telemetry.recordCustomMetric('mastodon.posts_purged', deletedCount, {
          account: accountName,
          dry_run: dryRun.toString(),
          preserved_count: skippedCount.toString(),
        });
      }

    } catch (error) {
      this.logger.error(`Failed to purge posts for account "${accountName}":`, error);
      throw new Error(`Post purge failed for ${accountName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the IDs of pinned posts for an account
   */
  private async getPinnedPosts(accountClient: AccountClient): Promise<Set<string>> {
    try {
      const accountInfo = await accountClient.client.v1.accounts.verifyCredentials();
      const pinnedStatuses = await accountClient.client.v1.accounts.$select(accountInfo.id).statuses.list({
        pinned: true,
        limit: 40, // Mastodon allows up to 5 pinned posts, but we'll be generous
      });
      
      const pinnedIds = new Set(pinnedStatuses.map(status => status.id));
      this.logger.debug(`Found ${pinnedIds.size} pinned posts for account "${accountClient.name}"`);
      return pinnedIds;
    } catch (error) {
      this.logger.warn(`Failed to fetch pinned posts for account "${accountClient.name}":`, error);
      return new Set(); // Return empty set if we can't fetch pinned posts
    }
  }
}