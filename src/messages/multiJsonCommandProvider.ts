import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { TelemetryService } from '../services/telemetryInterface';

const execAsync = promisify(exec);

/**
 * Cache entry for tracking processed items
 */
interface CacheEntry {
  timestamp: number;
  uniqueKeyValue: string;
  providerName: string;
}

/**
 * Configuration for the Multi JSON Command message provider
 */
export interface MultiJsonCommandProviderConfig extends MessageProviderConfig {
  command: string;
  template: string;
  timeout?: number; // Timeout in milliseconds (default: 30000)
  cwd?: string; // Working directory for the command
  env?: Record<string, string>; // Environment variables
  maxBuffer?: number; // Maximum buffer size for stdout/stderr (default: 1024 * 1024)
  uniqueKey?: string; // Unique key field name (default: "id")
  throttleDelay?: number; // DEPRECATED: Use cron schedule instead for timing between messages
  cache?: {
    enabled?: boolean; // Enable caching (default: true)
    ttl?: number; // Time to live in milliseconds (default: 1209600000 = 14 days)
    maxSize?: number; // Maximum cache entries (default: 10000)
    filePath?: string; // Path to cache file (default: ./cache/multijson-cache.json)
  };
}

/**
 * Multi JSON Command message provider
 * Executes an external command, parses its stdout as JSON array, and applies a template
 * for each object in the array, sending multiple messages with throttling
 */
export class MultiJsonCommandProvider implements MessageProvider {
  private command: string;
  private template: string;
  private timeout: number;
  private cwd?: string;
  private env?: Record<string, string>;
  private maxBuffer: number;
  private uniqueKey: string;
  private throttleDelay: number;
  private logger?: Logger;
  private telemetry?: TelemetryService;
  
  // Cache properties
  private cacheEnabled: boolean;
  private cacheTtl: number;
  private cacheMaxSize: number;
  private cacheFilePath: string;
  private cache: Map<string, CacheEntry>;
  private skipCaching: boolean = false;
  private providerName: string = '';

  constructor(config: MultiJsonCommandProviderConfig) {
    if (!config.command) {
      throw new Error('Command is required for MultiJsonCommandProvider');
    }
    
    if (!config.template) {
      throw new Error('Template is required for MultiJsonCommandProvider');
    }
    
    this.command = config.command;
    this.template = config.template;
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.cwd = config.cwd;
    this.env = config.env;
    this.maxBuffer = config.maxBuffer || 1024 * 1024; // 1MB default
    this.uniqueKey = config.uniqueKey || 'id';
    this.throttleDelay = config.throttleDelay || 1000; // 1 second default
    
    // Initialize cache configuration
    this.cacheEnabled = config.cache?.enabled !== false; // Default to true
    this.cacheTtl = config.cache?.ttl || 1209600000; // 14 days default
    this.cacheMaxSize = config.cache?.maxSize || 10000; // 10k entries default
    this.cacheFilePath = config.cache?.filePath || './cache/multijson-cache.json';
    this.cache = new Map<string, CacheEntry>();
  }

  /**
   * Generates a single message by executing the configured command, parsing JSON array output,
   * and returning the next unprocessed object as a message
   */
  public async generateMessage(): Promise<string> {
    this.logger?.debug(`Executing command: "${this.command}"`);
    
    try {
      const options = {
        timeout: this.timeout,
        cwd: this.cwd,
        env: this.env ? { ...process.env, ...this.env } : process.env,
        maxBuffer: this.maxBuffer,
      };

      const { stdout, stderr } = await execAsync(this.command, options);
      
      if (stderr) {
        this.logger?.warn(`Command stderr: ${stderr.trim()}`);
      }

      const output = stdout.trim();
      
      if (!output) {
        throw new Error('Command produced no output');
      }

      this.logger?.debug(`Command output: "${output}"`);
      
      // Parse JSON output
      let jsonData: unknown;
      try {
        jsonData = JSON.parse(output);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`Failed to parse command output as JSON: ${errorMessage}`);
      }

      // Validate that the output is an array
      if (!Array.isArray(jsonData)) {
        throw new Error('Command output must be a JSON array');
      }

      if (jsonData.length === 0) {
        this.logger?.info('Command returned empty array, no messages to send');
        return '';
      }

      // Validate that all items are objects
      for (let i = 0; i < jsonData.length; i++) {
        if (typeof jsonData[i] !== 'object' || jsonData[i] === null) {
          throw new Error(`Array item at index ${i} is not an object`);
        }
      }

      const objects = jsonData as Record<string, unknown>[];
      
      // Log the number of objects found
      this.logger?.info(`Found ${objects.length} objects to process`);
      
      // Validate unique keys
      this.validateUniqueKeys(objects);
      
      // Find the first unprocessed object
      const nextObject = await this.findNextUnprocessedObject(objects);
      
      if (!nextObject) {
        this.logger?.info('All objects have been processed (cached), no new messages to send');
        return '';
      }
      
      // Process the single object
      const message = await this.processSingleObject(nextObject);
      
      return message;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Multi JSON command execution failed: ${errorMessage}`);
      throw new Error(`Failed to execute multi JSON command: ${errorMessage}`);
    }
  }

  /**
   * Finds the first unprocessed object from the array
   */
  private async findNextUnprocessedObject(objects: Record<string, unknown>[]): Promise<Record<string, unknown> | null> {
    let cachedCount = 0;
    
    // Find the first non-cached item
    for (const obj of objects) {
      const uniqueId = String(obj[this.uniqueKey]);
      
      if (this.isItemCached(uniqueId)) {
        cachedCount++;
        this.logger?.debug(`Skipping cached item: ${this.uniqueKey}="${uniqueId}"`);
        
        // Record telemetry for cached items
        if (this.telemetry) {
          this.telemetry.incrementCounter('messages_cached_skip', 1, { provider: this.getProviderName() });
        }
      } else {
        if (cachedCount > 0) {
          this.logger?.info(`Skipped ${cachedCount} cached items, found 1 new item to process`);
        }
        
        // Record cache performance metrics
        if (this.telemetry && this.cacheEnabled) {
          this.recordCacheMetrics();
        }
        
        return obj;
      }
    }
    
    if (cachedCount > 0) {
      this.logger?.info(`Skipped ${cachedCount} cached items, no new items to process`);
    }
    
    // Record cache performance metrics
    if (this.telemetry && this.cacheEnabled) {
      this.recordCacheMetrics();
    }
    
    return null;
  }

  /**
   * Processes a single object and generates a message
   */
  private async processSingleObject(obj: Record<string, unknown>): Promise<string> {
    try {
      const uniqueId = String(obj[this.uniqueKey]);
      
      // Apply template with JSON variables
      const message = this.applyTemplate(this.template, obj);
      
      this.logger?.debug(`Generated message for ${this.uniqueKey}="${uniqueId}": "${message}"`);
      
      // Add to cache after successful message generation
      await this.addToCache(uniqueId);
      
      // Record telemetry
      if (this.telemetry) {
        this.telemetry.incrementCounter('messages_generated', 1, { provider: this.getProviderName() });
      }
      
      return message;
      
    } catch (error) {
      const uniqueId = obj[this.uniqueKey];
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to process object with ${this.uniqueKey}="${uniqueId}": ${errorMessage}`);
      
      // Record telemetry for errors
      if (this.telemetry) {
        this.telemetry.incrementCounter('messages_generation_errors', 1, { provider: this.getProviderName() });
      }
      
      throw error;
    }
  }

  /**
   * Validates that all objects have the required unique key and that values are unique
   */
  private validateUniqueKeys(objects: Record<string, unknown>[]): void {
    const seenKeys = new Set<string>();
    
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      
      if (!(this.uniqueKey in obj)) {
        throw new Error(`Object at index ${i} is missing required unique key "${this.uniqueKey}"`);
      }
      
      const keyValue = String(obj[this.uniqueKey]);
      
      if (seenKeys.has(keyValue)) {
        throw new Error(`Duplicate unique key value "${keyValue}" found in array`);
      }
      
      seenKeys.add(keyValue);
    }
  }

  /**
   * Applies a template string with variables from JSON data
   * Supports syntax like {{variable}} and {{nested.property}}
   */
  private applyTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();
      const value = this.getNestedProperty(data, trimmedPath);
      
      if (value === undefined || value === null) {
        this.logger?.warn(`Template variable "${trimmedPath}" not found in JSON data`);
        return match; // Return the original placeholder if variable not found
      }
      
      return String(value);
    });
  }

  /**
   * Gets a nested property from an object using dot notation
   * e.g., "user.name" returns data.user.name
   */
  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }


  /**
   * Loads cache from persistent storage
   */
  private async loadCacheFromFile(): Promise<void> {
    if (!this.cacheEnabled) {
      return;
    }

    try {
      // Ensure cache directory exists
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        this.logger?.debug(`Created cache directory: ${cacheDir}`);
      }

      if (fs.existsSync(this.cacheFilePath)) {
        const fileContent = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const cacheData = JSON.parse(fileContent) as Record<string, CacheEntry>;
        
        // Load entries into Map and clean up expired ones
        const now = Date.now();
        let loadedCount = 0;
        let expiredCount = 0;

        for (const [key, entry] of Object.entries(cacheData)) {
          if (now - entry.timestamp <= this.cacheTtl) {
            this.cache.set(key, entry);
            loadedCount++;
          } else {
            expiredCount++;
          }
        }

        this.logger?.info(`Loaded ${loadedCount} cache entries from ${this.cacheFilePath}`);
        if (expiredCount > 0) {
          this.logger?.info(`Skipped ${expiredCount} expired cache entries`);
        }
      } else {
        this.logger?.debug(`Cache file does not exist: ${this.cacheFilePath}`);
      }
    } catch (error) {
      this.logger?.error(`Failed to load cache from file: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without cache rather than failing
      this.cache.clear();
    }
  }

  /**
   * Saves cache to persistent storage
   */
  private async saveCacheToFile(): Promise<void> {
    if (!this.cacheEnabled) {
      return;
    }

    try {
      // Convert Map to plain object for JSON serialization
      const cacheData: Record<string, CacheEntry> = {};
      for (const [key, entry] of this.cache.entries()) {
        cacheData[key] = entry;
      }

      // Ensure cache directory exists
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // Write to temporary file first, then rename for atomic operation
      const tempFilePath = `${this.cacheFilePath}.tmp`;
      fs.writeFileSync(tempFilePath, JSON.stringify(cacheData, null, 2), 'utf-8');
      fs.renameSync(tempFilePath, this.cacheFilePath);

      this.logger?.debug(`Saved ${this.cache.size} cache entries to ${this.cacheFilePath}`);
    } catch (error) {
      this.logger?.error(`Failed to save cache to file: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw - cache save failure shouldn't break the provider
    }
  }

  /**
   * Creates a cache key combining provider name and unique key value
   */
  private createCacheKey(uniqueKeyValue: string): string {
    return `${this.providerName}:${uniqueKeyValue}`;
  }

  /**
   * Checks if an item is already cached (and not expired)
   */
  private isItemCached(uniqueKeyValue: string): boolean {
    if (!this.cacheEnabled || this.skipCaching) {
      return false;
    }

    const cacheKey = this.createCacheKey(uniqueKeyValue);
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtl) {
      this.cache.delete(cacheKey);
      this.logger?.debug(`Cache entry expired for ${this.uniqueKey}="${uniqueKeyValue}"`);
      return false;
    }

    return true;
  }

  /**
   * Adds an item to the cache
   */
  private async addToCache(uniqueKeyValue: string): Promise<void> {
    if (!this.cacheEnabled || this.skipCaching) {
      return;
    }

    // Clean up expired entries and enforce max size
    this.cleanupCache();

    const cacheKey = this.createCacheKey(uniqueKeyValue);
    const entry: CacheEntry = {
      timestamp: Date.now(),
      uniqueKeyValue: uniqueKeyValue,
      providerName: this.providerName
    };

    this.cache.set(cacheKey, entry);
    this.logger?.debug(`Added to cache: ${this.uniqueKey}="${uniqueKeyValue}" (key: ${cacheKey})`);

    // Save to persistent storage (async, don't wait)
    this.saveCacheToFile().catch(error => {
      this.logger?.error(`Failed to persist cache: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /**
   * Cleans up expired cache entries and enforces max size limit
   * Optimized to only run cleanup when necessary
   */
  private cleanupCache(): void {
    if (!this.cacheEnabled) {
      return;
    }

    const now = Date.now();
    let expiredCount = 0;
    let sizeReductionNeeded = false;

    // Check if we need size reduction first (more efficient)
    if (this.cache.size >= this.cacheMaxSize) {
      sizeReductionNeeded = true;
    }

    // Remove expired entries (always check these)
    const expiredKeys: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTtl) {
        expiredKeys.push(key);
        expiredCount++;
      }
    }

    // Batch delete expired entries for better performance
    expiredKeys.forEach(key => this.cache.delete(key));

    if (expiredCount > 0) {
      this.logger?.debug(`Cleaned up ${expiredCount} expired cache entries`);
      
      // Record telemetry for cache cleanup
      if (this.telemetry) {
        this.telemetry.incrementCounter('cache_entries_expired', expiredCount, { provider: this.getProviderName() });
      }
    }

    // Enforce max size by removing oldest entries (only if still needed after expiry cleanup)
    if (sizeReductionNeeded && this.cache.size >= this.cacheMaxSize) {
      const entriesToRemove = this.cache.size - this.cacheMaxSize + 1;
      const sortedEntries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const keysToRemove = sortedEntries.slice(0, entriesToRemove).map(([key]) => key);
      keysToRemove.forEach(key => this.cache.delete(key));

      this.logger?.debug(`Removed ${keysToRemove.length} oldest cache entries to enforce max size`);
      
      // Record telemetry for size enforcement
      if (this.telemetry) {
        this.telemetry.incrementCounter('cache_entries_evicted', keysToRemove.length, { provider: this.getProviderName() });
      }
    }
  }

  /**
   * Gets comprehensive cache statistics
   */
  private getCacheStats(): { 
    size: number; 
    enabled: boolean; 
    ttl: number; 
    maxSize: number;
    filePath: string;
    utilizationPercent: number;
    oldestEntryAge?: number;
    newestEntryAge?: number;
  } {
    const stats = {
      size: this.cache.size,
      enabled: this.cacheEnabled,
      ttl: this.cacheTtl,
      maxSize: this.cacheMaxSize,
      filePath: this.cacheFilePath,
      utilizationPercent: Math.round((this.cache.size / this.cacheMaxSize) * 100),
      oldestEntryAge: undefined as number | undefined,
      newestEntryAge: undefined as number | undefined,
    };

    if (this.cache.size > 0) {
      const now = Date.now();
      let oldestTimestamp = now;
      let newestTimestamp = 0;

      for (const entry of this.cache.values()) {
        if (entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
        }
        if (entry.timestamp > newestTimestamp) {
          newestTimestamp = entry.timestamp;
        }
      }

      stats.oldestEntryAge = Math.round((now - oldestTimestamp) / 1000); // seconds
      stats.newestEntryAge = Math.round((now - newestTimestamp) / 1000); // seconds
    }

    return stats;
  }

  /**
   * Records cache performance metrics to telemetry
   */
  private recordCacheMetrics(): void {
    if (!this.telemetry || !this.cacheEnabled) {
      return;
    }

    const stats = this.getCacheStats();
    const providerName = this.getProviderName();

    // Record cache size and utilization
    this.telemetry.setGauge('cache_size', stats.size, { provider: providerName });
    this.telemetry.setGauge('cache_utilization_percent', stats.utilizationPercent, { provider: providerName });

    // Record cache age metrics if available
    if (stats.oldestEntryAge !== undefined) {
      this.telemetry.setGauge('cache_oldest_entry_age_seconds', stats.oldestEntryAge, { provider: providerName });
    }
    if (stats.newestEntryAge !== undefined) {
      this.telemetry.setGauge('cache_newest_entry_age_seconds', stats.newestEntryAge, { provider: providerName });
    }
  }

  /**
   * Gets the provider name
   */
  public getProviderName(): string {
    return 'multijsoncommand';
  }

  /**
   * Initialize the provider
   */
  public async initialize(logger: Logger, telemetry?: TelemetryService, providerName?: string): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.providerName = providerName || 'unknown';
    
    this.logger.info(`Initialized MultiJsonCommandProvider "${this.providerName}" with command: "${this.command}"`);
    this.logger.info(`Template: "${this.template}"`);
    this.logger.info(`Unique key: "${this.uniqueKey}"`);
    this.logger.info(`Throttle delay: ${this.throttleDelay}ms (DEPRECATED: Use cron schedule for timing)`);
    
    // Log cache configuration
    if (this.cacheEnabled) {
      this.logger.info(`Cache enabled: TTL=${this.cacheTtl}ms, Max size=${this.cacheMaxSize}, File: ${this.cacheFilePath}`);
      
      // Load cache from persistent storage
      await this.loadCacheFromFile();
    } else {
      this.logger.info('Cache disabled');
    }
    
    // Validate that the command can be executed by doing a dry run
    try {
      // Skip caching during validation to avoid polluting cache
      this.skipCaching = true;
      await this.generateMessage();
      this.skipCaching = false;
      
      this.logger.info('Multi JSON command provider validation successful');
      
      // Log cache stats after validation
      if (this.cacheEnabled) {
        const stats = this.getCacheStats();
        this.logger.info(`Cache stats after validation: ${stats.size} entries (${stats.utilizationPercent}% utilization)`);
        
        // Record initial cache metrics
        this.recordCacheMetrics();
      }
    } catch (error) {
      this.skipCaching = false; // Reset flag even on error
      this.logger.warn(`Multi JSON command provider validation failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw here - let it fail during actual execution
    }
  }
}