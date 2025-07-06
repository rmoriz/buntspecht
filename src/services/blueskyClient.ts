import { BskyAgent } from '@atproto/api';
import { BotConfig, AccountConfig } from '../types/config';
import { Logger } from '../utils/logger';
import type { TelemetryService } from './telemetryInterface';

interface BlueskyAccountClient {
  name: string;
  config: AccountConfig;
  agent: BskyAgent;
}

interface ExternalEmbed {
  $type: 'app.bsky.embed.external';
  external: {
    uri: string;
    title: string;
    description: string;
    thumb?: {
      $type: 'blob';
      ref: {
        $link: string;
      };
      mimeType: string;
      size: number;
    };
  };
}

interface LinkMetadata {
  title: string;
  description: string;
  image?: string;
}

interface Facet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: Array<{
    $type: string;
    tag?: string;
    did?: string;
  }>;
}

interface HashtagMatch {
  hashtag: string;
  start: number;
  end: number;
}

interface MentionMatch {
  handle: string;
  start: number;
  end: number;
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

  /**
   * Detects URLs in text using a robust pattern that captures complete URLs
   * Looks for http:// or https:// and continues until whitespace or end of string
   */
  private detectUrls(text: string): string[] {
    // More robust regex: starts with http:// or https:// and continues until whitespace
    // This ensures we capture the complete URL including paths, query parameters, etc.
    const urlRegex = /https?:\/\/\S+/g;
    const matches = text.match(urlRegex);
    return matches || [];
  }

  /**
   * Detects hashtags in text and returns their positions
   */
  private detectHashtags(text: string): HashtagMatch[] {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const matches: HashtagMatch[] = [];
    let match;

    while ((match = hashtagRegex.exec(text)) !== null) {
      matches.push({
        hashtag: match[0].slice(1), // Remove the # symbol
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return matches;
  }

  /**
   * Detects mentions in text and returns their positions
   */
  private detectMentions(text: string): MentionMatch[] {
    const mentionRegex = /@[a-zA-Z0-9._-]+(?:\.[a-zA-Z]{2,})?/g;
    const matches: MentionMatch[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      matches.push({
        handle: match[0].slice(1), // Remove the @ symbol
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return matches;
  }

  /**
   * Creates facets for hashtags and mentions in the text
   */
  private createFacets(text: string): Facet[] {
    const facets: Facet[] = [];

    // Detect hashtags
    const hashtags = this.detectHashtags(text);
    for (const hashtag of hashtags) {
      const startBytes = new TextEncoder().encode(text.slice(0, hashtag.start)).length;
      const endBytes = new TextEncoder().encode(text.slice(0, hashtag.end)).length;

      facets.push({
        index: {
          byteStart: startBytes,
          byteEnd: endBytes,
        },
        features: [
          {
            $type: 'app.bsky.richtext.facet#tag',
            tag: hashtag.hashtag,
          },
        ],
      });
    }

    // Detect mentions
    const mentions = this.detectMentions(text);
    for (const mention of mentions) {
      const startBytes = new TextEncoder().encode(text.slice(0, mention.start)).length;
      const endBytes = new TextEncoder().encode(text.slice(0, mention.end)).length;

      facets.push({
        index: {
          byteStart: startBytes,
          byteEnd: endBytes,
        },
        features: [
          {
            $type: 'app.bsky.richtext.facet#mention',
            did: `at://${mention.handle}`, // This is a simplified DID - in practice, you'd resolve the handle to a proper DID
          },
        ],
      });
    }

    // Sort facets by start position
    facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

    return facets;
  }

  /**
   * Fetches metadata for a URL by scraping basic HTML meta tags
   */
  private async fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
    try {
      this.logger.debug(`Fetching metadata for URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Buntspecht Bot/1.0 (+https://github.com/rmoriz/buntspecht)',
        },
        // Set a reasonable timeout
        signal: AbortSignal.timeout(10000), // 10 seconds
      });

      if (!response.ok) {
        this.logger.warn(`Failed to fetch URL ${url}: ${response.status} ${response.statusText}`);
        return null;
      }

      const html = await response.text();
      
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      const title = ogTitleMatch?.[1] || titleMatch?.[1] || new URL(url).hostname;

      // Extract description
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      const description = ogDescMatch?.[1] || descMatch?.[1] || '';

      // Extract image (optional for now, as uploading images to Bluesky requires additional steps)
      const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      const image = ogImageMatch?.[1] || undefined;

      this.logger.debug(`Extracted metadata for ${url}: title="${title}", description="${description}"`);

      return {
        title: title.trim(),
        description: description.trim(),
        image,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch metadata for URL ${url}:`, error);
      return null;
    }
  }

  /**
   * Creates an external embed for the first URL found in the text and returns both the embed and the URL to remove
   */
  private async createExternalEmbed(text: string): Promise<{ embed: ExternalEmbed; urlToRemove: string } | null> {
    const urls = this.detectUrls(text);
    if (urls.length === 0) {
      return null;
    }

    // Use the first URL found for embedding
    const url = urls[0];
    const metadata = await this.fetchLinkMetadata(url);
    
    if (!metadata) {
      return null;
    }

    return {
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: url,
          title: metadata.title || new URL(url).hostname,
          description: metadata.description || '',
          // Note: thumb (image) support would require uploading the image as a blob first
          // This is more complex and can be added in a future enhancement
        },
      },
      urlToRemove: url,
    };
  }

  /**
   * Removes a URL from the text and cleans up extra whitespace while preserving newlines
   * Also removes exactly one newline that appears immediately before the URL
   */
  private removeUrlFromText(text: string, urlToRemove: string): string {
    // Escape special regex characters in the URL for safe replacement
    const escapedUrl = urlToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create regex pattern that optionally matches one newline before the URL
    // This will remove the URL and exactly one preceding newline if it exists
    const urlWithOptionalNewlineRegex = new RegExp(`(?:\n)?${escapedUrl}`, 'g');
    
    // Remove the URL (and optional preceding newline) from the text
    let cleanedText = text.replace(urlWithOptionalNewlineRegex, '');
    
    // Clean up extra spaces and tabs, but preserve newlines
    // Replace multiple consecutive spaces/tabs with a single space, but keep newlines
    cleanedText = cleanedText.replace(/[ \t]+/g, ' ');
    
    // Clean up spaces before newlines and at the end of lines
    cleanedText = cleanedText.replace(/[ \t]+\n/g, '\n');
    
    // Trim only leading/trailing spaces, not newlines
    cleanedText = cleanedText.replace(/^[ \t]+|[ \t]+$/g, '');
    
    return cleanedText;
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
          
          // Check for URLs and create external embed if found
          const embedResult = await this.createExternalEmbed(message);
          
          // Determine the final text to use (with URL removed if embed was created)
          let finalText = message;
          if (embedResult) {
            finalText = this.removeUrlFromText(message, embedResult.urlToRemove);
            this.logger.debug(`Removed URL from text: "${embedResult.urlToRemove}"`);
          }
          
          // Create facets for hashtags and mentions using the final text
          const facets = this.createFacets(finalText);
          
          const postData: {
            text: string;
            createdAt: string;
            embed?: ExternalEmbed;
            facets?: Facet[];
          } = {
            text: finalText,
            createdAt: new Date().toISOString(),
          };

          if (embedResult) {
            postData.embed = embedResult.embed;
            this.logger.debug(`Adding external embed for URL: ${embedResult.embed.external.uri}`);
          }

          if (facets.length > 0) {
            postData.facets = facets;
            this.logger.debug(`Adding ${facets.length} facets for hashtags/mentions`);
          }

          const response = await accountClient.agent.post(postData);

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