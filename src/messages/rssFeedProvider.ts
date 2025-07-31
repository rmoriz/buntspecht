import { MessageProvider, MessageProviderConfig, MessageWithAttachments } from './messageProvider';
import { Logger } from '../utils/logger';
import { TelemetryService } from '../services/telemetryInterface';
import { MessageDeduplicator } from './multiJson/MessageDeduplicator';
import { JsonTemplateProcessor } from '../utils/jsonTemplateProcessor';
import Parser from 'rss-parser';

export interface RSSFeedProviderConfig extends MessageProviderConfig {
  feedUrl: string;
  template?: string; // Template for formatting feed items (optional)
  cache?: {
    enabled?: boolean;
    ttl?: number;
    maxSize?: number;
    filePath?: string;
    autoWarm?: boolean; // Auto-warm cache on first run to prevent posting old items (default: true)
  };
  timeout?: number; // Request timeout in milliseconds
  userAgent?: string; // Custom user agent
  maxItems?: number; // Maximum number of items to process (default: unlimited)
  retries?: number; // Number of retry attempts on failure (default: 3)
  filters?: {
    // Title-based filtering
    titleInclude?: string[]; // Only include items with titles matching these patterns (regex supported)
    titleExclude?: string[]; // Exclude items with titles matching these patterns (regex supported)
    // Link-based filtering
    linkInclude?: string[]; // Only include items with links matching these patterns (regex supported)
    linkExclude?: string[]; // Exclude items with links matching these patterns (regex supported)
    // Content-based filtering
    contentInclude?: string[]; // Only include items with content matching these patterns (regex supported)
    contentExclude?: string[]; // Exclude items with content matching these patterns (regex supported)
    // Case sensitivity for pattern matching (default: false)
    caseSensitive?: boolean;
    // Whether to use regex patterns (default: false, uses simple string contains)
    useRegex?: boolean;
    // Predefined filter presets
    presets?: {
      excludeYouTubeShorts?: boolean; // Exclude YouTube Shorts URLs
      excludeYouTubeLive?: boolean; // Exclude YouTube Live streams
      includeOnlyYouTubeVideos?: boolean; // Only include regular YouTube videos
    };
  };
}

export class RSSFeedProvider implements MessageProvider {
  private config: RSSFeedProviderConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;
  private deduplicator: MessageDeduplicator;
  private providerName = 'rssfeed';

  constructor(config: RSSFeedProviderConfig) {
    if (!config.feedUrl) throw new Error('feedUrl is required');
    if (!this.isValidUrl(config.feedUrl)) throw new Error('feedUrl must be a valid HTTP/HTTPS URL');
    
    // Set defaults
    this.config = {
      timeout: 30000, // 30 seconds
      maxItems: undefined, // Process all available items by default
      retries: 3,
      userAgent: 'Buntspecht RSS Reader/1.0',
      ...config
    };
    
    const cacheDir = config.cache?.filePath ? require('path').dirname(config.cache.filePath) : './cache';
    this.deduplicator = new MessageDeduplicator(cacheDir, console as any);
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  public async initialize(logger: Logger, telemetry?: TelemetryService, providerName?: string): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    
    // Set provider name if provided, otherwise keep default
    if (providerName) {
      this.providerName = providerName;
    }
    
    const cacheDir = this.config.cache?.filePath ? require('path').dirname(this.config.cache.filePath) : './cache';
    this.deduplicator = new MessageDeduplicator(cacheDir, logger);
    
    // Auto-warm cache if no cache file exists and caching is enabled
    if (this.config.cache?.enabled !== false && this.config.cache?.autoWarm !== false) {
      await this.autoWarmCacheIfNeeded();
    }
    
    this.logger.info(`Initialized RSSFeedProvider for ${this.config.feedUrl} (provider: ${this.providerName})`);
  }

  public getProviderName(): string {
    return this.providerName;
  }

  public async generateMessage(): Promise<string> {
    const items = await this.fetchFeedItems();
    if (!items.length) return '';
    const oldest = items[0]; // Items are now sorted oldest first
    
    // Mark the item as processed and save cache
    if (this.config.cache?.enabled !== false) {
      const processed = this.deduplicator.loadProcessedItems(this.providerName);
      const key = this.getItemKey(oldest);
      if (key) {
        this.deduplicator.markItemAsProcessed(processed, key);
        this.deduplicator.saveProcessedItems(this.providerName, processed);
        this.logger?.debug(`Marked RSS item as processed: ${key}`);
      }
    }
    
    return this.formatItem(oldest);
  }

  public async generateMessageWithAttachments(): Promise<MessageWithAttachments> {
    const items = await this.fetchFeedItems();
    if (!items.length) return { text: '' };
    const oldest = items[0]; // Items are now sorted oldest first
    
    // Mark the item as processed and save cache
    if (this.config.cache?.enabled !== false) {
      const processed = this.deduplicator.loadProcessedItems(this.providerName);
      const key = this.getItemKey(oldest);
      if (key) {
        this.deduplicator.markItemAsProcessed(processed, key);
        this.deduplicator.saveProcessedItems(this.providerName, processed);
        this.logger?.debug(`Marked RSS item as processed: ${key}`);
      }
    }
    
    return { text: this.formatItem(oldest) };
  }

  private async fetchFeedItems(): Promise<any[]> {
    const maxRetries = this.config.retries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const parser = new Parser({
          timeout: this.config.timeout || 30000,
          headers: {
            'User-Agent': this.config.userAgent || 'Buntspecht RSS Reader/1.0'
          }
        });

        this.logger?.debug(`Fetching RSS feed from ${this.config.feedUrl} (attempt ${attempt}/${maxRetries})`);
        const feed = await parser.parseURL(this.config.feedUrl);
        
        if (!feed) {
          throw new Error('Feed parsing returned null or undefined');
        }

        let items = feed.items || [];
        if (!Array.isArray(items)) {
          this.logger?.warn('Feed items is not an array, treating as empty feed');
          items = [];
        }

        // Limit items if maxItems is specified
        if (this.config.maxItems && this.config.maxItems > 0) {
          items = items.slice(0, this.config.maxItems);
        }

        // Filter processed items if caching is enabled
        const processed = this.config.cache?.enabled !== false 
          ? this.deduplicator.loadProcessedItems(this.providerName) 
          : new Set<string>();
        
        items = items.filter(item => {
          if (!item) return false; // Skip null/undefined items
          const key = this.getItemKey(item);
          return key && !processed.has(key);
        });

        // Apply content filters if configured
        if (this.config.filters) {
          items = this.applyFilters(items);
        }

        // Sort items by date (oldest first) for chronological processing
        items = this.sortItemsByDate(items);

        this.logger?.debug(`Fetched ${items.length} new items from RSS feed`);
        return items;

      } catch (error) {
        lastError = error as Error;
        this.logger?.warn(`RSS feed fetch attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          this.logger?.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.logger?.error(`Failed to fetch RSS feed after ${maxRetries} attempts: ${lastError?.message}`);
    throw lastError || new Error('RSS feed fetch failed');
  }

  private getItemKey(item: any): string | null {
    return item?.pubDate || item?.isoDate || item?.id || item?.title || item?.link || null;
  }

  /**
   * Sort RSS items by date (oldest first) for chronological processing
   */
  private sortItemsByDate(items: any[]): any[] {
    return items.sort((a, b) => {
      const dateA = this.getItemDate(a);
      const dateB = this.getItemDate(b);
      
      // If both have dates, sort by date (oldest first)
      if (dateA && dateB) {
        return dateA.getTime() - dateB.getTime();
      }
      
      // Items without dates go to the end
      if (!dateA && dateB) return 1;
      if (dateA && !dateB) return -1;
      
      // If neither has a date, maintain original order
      return 0;
    });
  }

  /**
   * Extract and parse date from RSS item
   */
  private getItemDate(item: any): Date | null {
    if (!item) return null;
    
    // Try different date fields in order of preference
    const dateStr = item.pubDate || item.isoDate || item.date;
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      // Check if date is valid
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  private formatItem(item: any): string {
    if (!item) return '';
    
    // If template is provided, use it
    if (this.config.template) {
      // Prepare item data for template processing
      const templateData = {
        title: item.title || 'Untitled',
        link: item.link || '',
        content: item.contentSnippet || item.content || item.description || '',
        description: item.description || '',
        contentSnippet: item.contentSnippet || '',
        pubDate: item.pubDate || '',
        isoDate: item.isoDate || '',
        id: item.id || '',
        author: item.author || item.creator || '',
        categories: Array.isArray(item.categories) ? item.categories.join(', ') : (item.categories || ''),
        // Include the raw item for advanced template usage
        ...item
      };
      
      // Override with cleaned content fields to ensure priority
      if (item.contentSnippet) {
        templateData.content = item.contentSnippet;
      } else if (item.content) {
        templateData.content = item.content;
      } else if (item.description) {
        templateData.content = item.description;
      }
      
      // Clean HTML from content fields
      if (templateData.content) {
        templateData.content = templateData.content.replace(/<[^>]*>/g, '').trim();
      }
      if (templateData.description) {
        templateData.description = templateData.description.replace(/<[^>]*>/g, '').trim();
      }
      if (templateData.contentSnippet) {
        templateData.contentSnippet = templateData.contentSnippet.replace(/<[^>]*>/g, '').trim();
      }
      
      const processor = new JsonTemplateProcessor(this.logger || console as any);
      return processor.applyTemplate(this.config.template, templateData);
    }
    
    // Default formatting (backward compatibility)
    const title = item.title || 'Untitled';
    const link = item.link || '';
    const content = item.contentSnippet || item.content || item.description || '';
    
    // Clean up content (remove HTML tags if present)
    const cleanContent = content.replace(/<[^>]*>/g, '').trim();
    
    return `${title}\n${link}\n${cleanContent}`;
  }

  /**
   * Check if cache file exists and auto-warm if needed
   */
  private async autoWarmCacheIfNeeded(): Promise<void> {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Determine cache file path
      const cacheDir = this.config.cache?.filePath ? path.dirname(this.config.cache.filePath) : './cache';
      const cacheFile = path.join(cacheDir, `${this.providerName}_processed.json`);
      
      // Check if cache file exists
      if (!fs.existsSync(cacheFile)) {
        this.logger?.info(`No cache file found for RSS provider '${this.providerName}', auto-warming cache to prevent posting old items...`);
        await this.warmCache();
        this.logger?.info(`Auto-warm completed for RSS provider '${this.providerName}'. Future runs will only process new items.`);
      } else {
        this.logger?.debug(`Cache file exists for RSS provider '${this.providerName}', skipping auto-warm`);
      }
    } catch (error) {
      this.logger?.warn(`Failed to check/create cache for RSS provider '${this.providerName}':`, error);
      // Don't throw - this is not critical, just continue without auto-warming
    }
  }

  public async warmCache(): Promise<void> {
    this.logger?.info(`Warming RSS cache for provider: ${this.providerName}`);
    
    try {
      const parser = new Parser({
        timeout: this.config.timeout || 30000,
        headers: {
          'User-Agent': this.config.userAgent || 'Buntspecht RSS Reader/1.0'
        }
      });
      
      const feed = await parser.parseURL(this.config.feedUrl);
      const processed = this.config.cache?.enabled !== false 
        ? this.deduplicator.loadProcessedItems(this.providerName) 
        : new Set<string>();
      
      let added = 0;
      let items = feed?.items || [];
      
      // Limit items if maxItems is specified
      if (this.config.maxItems && this.config.maxItems > 0) {
        items = items.slice(0, this.config.maxItems);
      }
      
      for (const item of items) {
        if (!item) continue;
        const key = this.getItemKey(item);
        if (key && !processed.has(key)) {
          this.deduplicator.markItemAsProcessed(processed, key);
          added++;
        }
      }
      
      if (this.config.cache?.enabled !== false) {
        this.deduplicator.saveProcessedItems(this.providerName, processed);
      }
      
      this.logger?.info(`Cache warmed for RSSFeedProvider: ${added} items added.`);
    } catch (error) {
      this.logger?.error(`Failed to warm RSS cache: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Apply content filters to RSS items
   */
  private applyFilters(items: any[]): any[] {
    if (!this.config.filters) {
      return items;
    }

    const filters = this.config.filters;
    let filteredItems = items;

    this.logger?.debug(`Applying filters to ${items.length} RSS items`);

    // Apply predefined presets first
    if (filters.presets) {
      filteredItems = this.applyPresetFilters(filteredItems, filters.presets);
    }

    // Apply custom filters
    filteredItems = filteredItems.filter(item => {
      if (!item) return false;

      const title = item.title || '';
      const link = item.link || '';
      const content = item.contentSnippet || item.content || item.description || '';

      // Title filters
      if (!this.passesFilter(title, filters.titleInclude, filters.titleExclude, filters.caseSensitive, filters.useRegex)) {
        this.logger?.debug(`Item filtered out by title filter: "${title}"`);
        return false;
      }

      // Link filters
      if (!this.passesFilter(link, filters.linkInclude, filters.linkExclude, filters.caseSensitive, filters.useRegex)) {
        this.logger?.debug(`Item filtered out by link filter: "${link}"`);
        return false;
      }

      // Content filters
      if (!this.passesFilter(content, filters.contentInclude, filters.contentExclude, filters.caseSensitive, filters.useRegex)) {
        this.logger?.debug(`Item filtered out by content filter`);
        return false;
      }

      return true;
    });

    const filteredCount = items.length - filteredItems.length;
    if (filteredCount > 0) {
      this.logger?.info(`RSS filters removed ${filteredCount} items, ${filteredItems.length} items remaining`);
    }

    return filteredItems;
  }

  /**
   * Apply predefined filter presets
   */
  private applyPresetFilters(items: any[], presets: NonNullable<RSSFeedProviderConfig['filters']>['presets']): any[] {
    if (!presets) return items;

    let filteredItems = items;

    if (presets.excludeYouTubeShorts) {
      filteredItems = filteredItems.filter(item => {
        const link = item.link || '';
        const title = item.title || '';
        
        // Check for YouTube Shorts URLs
        const shortsPatterns = [
          /youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/i,
          /m\.youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/i,
          /youtu\.be\/[a-zA-Z0-9_-]{11}.*shorts/i
        ];

        const isShorts = shortsPatterns.some(pattern => pattern.test(link)) ||
                        /\bshorts?\b/i.test(title);

        if (isShorts) {
          this.logger?.debug(`Excluded YouTube Shorts: "${title}" - ${link}`);
          return false;
        }
        return true;
      });
    }

    if (presets.excludeYouTubeLive) {
      filteredItems = filteredItems.filter(item => {
        const link = item.link || '';
        const title = item.title || '';
        
        const isLive = /\blive\b/i.test(title) || 
                      /live_stream/i.test(link) ||
                      /livestream/i.test(title);

        if (isLive) {
          this.logger?.debug(`Excluded YouTube Live: "${title}" - ${link}`);
          return false;
        }
        return true;
      });
    }

    if (presets.includeOnlyYouTubeVideos) {
      filteredItems = filteredItems.filter(item => {
        const link = item.link || '';
        
        const isYouTubeVideo = /youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/i.test(link) ||
                              /youtu\.be\/[a-zA-Z0-9_-]{11}$/i.test(link);

        if (!isYouTubeVideo) {
          this.logger?.debug(`Excluded non-YouTube video: "${item.title}" - ${link}`);
          return false;
        }
        return true;
      });
    }

    return filteredItems;
  }

  /**
   * Check if a text passes include/exclude filters
   */
  private passesFilter(
    text: string, 
    includePatterns?: string[], 
    excludePatterns?: string[], 
    caseSensitive: boolean = false,
    useRegex: boolean = false
  ): boolean {
    if (!text) return !includePatterns || includePatterns.length === 0;

    const processedText = caseSensitive ? text : text.toLowerCase();

    // Check exclude patterns first (if any match, item is excluded)
    if (excludePatterns && excludePatterns.length > 0) {
      for (const pattern of excludePatterns) {
        const processedPattern = caseSensitive ? pattern : pattern.toLowerCase();
        
        if (useRegex) {
          try {
            const regex = new RegExp(processedPattern, caseSensitive ? '' : 'i');
            if (regex.test(text)) {
              return false;
            }
          } catch {
            this.logger?.warn(`Invalid regex pattern in exclude filter: ${pattern}`);
            // Fallback to string contains
            if (processedText.includes(processedPattern)) {
              return false;
            }
          }
        } else {
          if (processedText.includes(processedPattern)) {
            return false;
          }
        }
      }
    }

    // Check include patterns (if specified, at least one must match)
    if (includePatterns && includePatterns.length > 0) {
      for (const pattern of includePatterns) {
        const processedPattern = caseSensitive ? pattern : pattern.toLowerCase();
        
        if (useRegex) {
          try {
            const regex = new RegExp(processedPattern, caseSensitive ? '' : 'i');
            if (regex.test(text)) {
              return true;
            }
          } catch {
            this.logger?.warn(`Invalid regex pattern in include filter: ${pattern}`);
            // Fallback to string contains
            if (processedText.includes(processedPattern)) {
              return true;
            }
          }
        } else {
          if (processedText.includes(processedPattern)) {
            return true;
          }
        }
      }
      // If include patterns are specified but none matched, exclude the item
      return false;
    }

    // No include patterns specified, item passes
    return true;
  }
}
