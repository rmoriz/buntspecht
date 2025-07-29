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
  };
  timeout?: number; // Request timeout in milliseconds
  userAgent?: string; // Custom user agent
  maxItems?: number; // Maximum number of items to process (default: 10)
  retries?: number; // Number of retry attempts on failure (default: 3)
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
      maxItems: 10,
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

  public async initialize(logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    const cacheDir = this.config.cache?.filePath ? require('path').dirname(this.config.cache.filePath) : './cache';
    this.deduplicator = new MessageDeduplicator(cacheDir, logger);
    this.logger.info(`Initialized RSSFeedProvider for ${this.config.feedUrl}`);
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

        // Limit items
        const maxItems = this.config.maxItems || 10;
        items = items.slice(0, maxItems);

        // Filter processed items if caching is enabled
        const processed = this.config.cache?.enabled !== false 
          ? this.deduplicator.loadProcessedItems(this.providerName) 
          : new Set<string>();
        
        items = items.filter(item => {
          if (!item) return false; // Skip null/undefined items
          const key = this.getItemKey(item);
          return key && !processed.has(key);
        });

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
      const maxItems = this.config.maxItems || 10;
      const items = (feed?.items || []).slice(0, maxItems);
      
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
}
