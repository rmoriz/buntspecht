import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { CacheMigrator } from './CacheMigrator';

/**
 * Handles message deduplication using cache files to prevent duplicate posts.
 * Manages cache persistence and cleanup operations.
 */
export class MessageDeduplicator {
  private logger: Logger;
  private cacheDir: string;
  private migrator: CacheMigrator;

  constructor(cacheDir: string, logger: Logger) {
    this.cacheDir = cacheDir;
    this.logger = logger;
    this.migrator = new CacheMigrator(logger);
    this.ensureCacheDirectory();
  }

  /**
   * Ensures the cache directory exists
   */
  private ensureCacheDirectory(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        this.logger.debug(`Created cache directory: ${this.cacheDir}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create cache directory ${this.cacheDir}:`, error);
    }
  }

  /**
   * Gets the cache file path for a provider
   */
  private getCacheFilePath(providerName: string): string {
    return path.join(this.cacheDir, `${providerName}_processed.json`);
  }

  /**
   * Loads processed items from cache, with automatic migration from legacy formats
   */
  public loadProcessedItems(providerName: string): Set<string> {
    const cacheFile = this.getCacheFilePath(providerName);
    const processedSet = new Set<string>();
    let currentCacheLoaded = false;
    
    // First, try to load current cache file
    try {
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, 'utf8');
        const parsed = JSON.parse(data);
        
        if (Array.isArray(parsed)) {
          parsed.forEach(item => processedSet.add(String(item)));
          currentCacheLoaded = true;
          this.logger.debug(`Loaded ${processedSet.size} processed items from current cache for provider: ${providerName}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to load current cache for provider ${providerName}:`, error);
    }

    // Always check for legacy cache files to merge, regardless of whether current cache exists
    this.logger.debug(`Checking for legacy cache files to merge for provider: ${providerName}`);
    
    const migratedItems = this.migrator.migrateCacheFiles(providerName, this.cacheDir);
    
    if (migratedItems.size > 0) {
      // Validate the migrated data
      if (this.migrator.validateMigratedData(migratedItems, providerName)) {
        const originalSize = processedSet.size;
        
        // Merge migrated items with current cache
        migratedItems.forEach(item => processedSet.add(item));
        
        const newItems = processedSet.size - originalSize;
        
        if (newItems > 0) {
          // Save the merged data in the new format
          this.saveProcessedItems(providerName, processedSet);
          this.logger.info(`Successfully merged ${migratedItems.size} legacy items (${newItems} new) with ${originalSize} current items for provider: ${providerName}`);
        } else {
          this.logger.debug(`All ${migratedItems.size} legacy items were already in current cache for provider: ${providerName}`);
        }
      } else {
        this.logger.warn(`Migration validation failed for provider ${providerName}, using only current cache`);
      }
    } else if (!currentCacheLoaded) {
      this.logger.debug(`No current cache or legacy cache found for provider: ${providerName}, starting fresh`);
    }

    return processedSet;
  }

  /**
   * Saves processed items to cache
   */
  public saveProcessedItems(providerName: string, processedItems: Set<string>): void {
    const cacheFile = this.getCacheFilePath(providerName);
    
    try {
      const data = JSON.stringify(Array.from(processedItems), null, 2);
      fs.writeFileSync(cacheFile, data, 'utf8');
      this.logger.debug(`Saved ${processedItems.size} processed items to cache for provider: ${providerName}`);
    } catch (error) {
      this.logger.error(`Failed to save cache for provider ${providerName}:`, error);
    }
  }

  /**
   * Checks if an item has already been processed
   */
  public isItemProcessed(processedItems: Set<string>, uniqueId: string): boolean {
    return processedItems.has(uniqueId);
  }

  /**
   * Marks an item as processed
   */
  public markItemAsProcessed(processedItems: Set<string>, uniqueId: string): void {
    processedItems.add(uniqueId);
  }

  /**
   * Filters out already processed items from a list
   */
  public filterUnprocessedItems(
    items: Record<string, unknown>[], 
    processedItems: Set<string>, 
    uniqueKey: string
  ): { unprocessed: Record<string, unknown>[]; skipped: number } {
    const unprocessed: Record<string, unknown>[] = [];
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const uniqueId = String(item[uniqueKey] || i);
      
      if (this.isItemProcessed(processedItems, uniqueId)) {
        skipped++;
        this.logger.debug(`Skipping already processed item: ${uniqueKey}="${uniqueId}"`);
      } else {
        unprocessed.push(item);
      }
    }

    this.logger.debug(`Filtered items: ${unprocessed.length} unprocessed, ${skipped} already processed`);
    return { unprocessed, skipped };
  }

  /**
   * Cleans up old cache files (optional maintenance operation)
   */
  public cleanupOldCacheFiles(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): void { // 30 days default
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      let cleaned = 0;

      for (const file of files) {
        if (file.endsWith('_processed.json')) {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > maxAgeMs) {
            fs.unlinkSync(filePath);
            cleaned++;
            this.logger.debug(`Cleaned up old cache file: ${file}`);
          }
        }
      }

      if (cleaned > 0) {
        this.logger.info(`Cleaned up ${cleaned} old cache files`);
      }
    } catch (error) {
      this.logger.warn('Failed to cleanup old cache files:', error);
    }
  }
}