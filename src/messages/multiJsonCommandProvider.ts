import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { TelemetryService } from '../services/telemetryInterface';

const execAsync = promisify(exec);

/**
 * Cache entry for tracking processed items
 */
interface CacheEntry {
  timestamp: number;
  uniqueKeyValue: string;
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
  throttleDelay?: number; // Delay between messages in milliseconds (default: 1000)
  cache?: {
    enabled?: boolean; // Enable caching (default: true)
    ttl?: number; // Time to live in milliseconds (default: 3600000 = 1 hour)
    maxSize?: number; // Maximum cache entries (default: 10000)
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
  private cache: Map<string, CacheEntry>;
  private skipCaching: boolean = false;

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
    this.cacheTtl = config.cache?.ttl || 3600000; // 1 hour default
    this.cacheMaxSize = config.cache?.maxSize || 10000; // 10k entries default
    this.cache = new Map<string, CacheEntry>();
  }

  /**
   * Generates messages by executing the configured command, parsing JSON array output,
   * and applying the template for each object
   * Note: This method returns the first message, but the provider will handle multiple messages internally
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
      
      // Process all objects and generate messages
      const messages = await this.processObjects(objects);
      
      // Return the first message (for compatibility with MessageProvider interface)
      return messages[0] || '';
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Multi JSON command execution failed: ${errorMessage}`);
      throw new Error(`Failed to execute multi JSON command: ${errorMessage}`);
    }
  }

  /**
   * Processes all objects and generates messages with throttling
   */
  private async processObjects(objects: Record<string, unknown>[]): Promise<string[]> {
    const messages: string[] = [];
    const newItems: Record<string, unknown>[] = [];
    let cachedCount = 0;
    
    // Filter out cached items
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
        newItems.push(obj);
      }
    }
    
    if (cachedCount > 0) {
      this.logger?.info(`Skipped ${cachedCount} cached items, processing ${newItems.length} new items`);
    }
    
    // Process new items
    for (let i = 0; i < newItems.length; i++) {
      const obj = newItems[i];
      
      try {
        const uniqueId = String(obj[this.uniqueKey]);
        
        // Apply template with JSON variables
        const message = this.applyTemplate(this.template, obj);
        messages.push(message);
        
        this.logger?.debug(`Generated message for ${this.uniqueKey}="${uniqueId}": "${message}"`);
        
        // Add to cache after successful message generation
        this.addToCache(uniqueId);
        
        // Record telemetry
        if (this.telemetry) {
          this.telemetry.incrementCounter('messages_generated', 1, { provider: this.getProviderName() });
        }
        
        // Apply throttling delay between messages (except for the last one)
        if (i < newItems.length - 1 && this.throttleDelay > 0) {
          this.logger?.debug(`Applying throttle delay of ${this.throttleDelay}ms`);
          await this.sleep(this.throttleDelay);
        }
        
      } catch (error) {
        const uniqueId = obj[this.uniqueKey];
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger?.error(`Failed to process object with ${this.uniqueKey}="${uniqueId}": ${errorMessage}`);
        
        // Record telemetry for errors
        if (this.telemetry) {
          this.telemetry.incrementCounter('messages_generation_errors', 1, { provider: this.getProviderName() });
        }
        // Continue processing other objects
      }
    }
    
    return messages;
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
   * Sleep utility for throttling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Checks if an item is already cached (and not expired)
   */
  private isItemCached(uniqueKeyValue: string): boolean {
    if (!this.cacheEnabled || this.skipCaching) {
      return false;
    }

    const entry = this.cache.get(uniqueKeyValue);
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtl) {
      this.cache.delete(uniqueKeyValue);
      this.logger?.debug(`Cache entry expired for ${this.uniqueKey}="${uniqueKeyValue}"`);
      return false;
    }

    return true;
  }

  /**
   * Adds an item to the cache
   */
  private addToCache(uniqueKeyValue: string): void {
    if (!this.cacheEnabled || this.skipCaching) {
      return;
    }

    // Clean up expired entries and enforce max size
    this.cleanupCache();

    const entry: CacheEntry = {
      timestamp: Date.now(),
      uniqueKeyValue: uniqueKeyValue
    };

    this.cache.set(uniqueKeyValue, entry);
    this.logger?.debug(`Added to cache: ${this.uniqueKey}="${uniqueKeyValue}"`);
  }

  /**
   * Cleans up expired cache entries and enforces max size limit
   */
  private cleanupCache(): void {
    if (!this.cacheEnabled) {
      return;
    }

    const now = Date.now();
    let expiredCount = 0;

    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTtl) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.logger?.debug(`Cleaned up ${expiredCount} expired cache entries`);
    }

    // Enforce max size by removing oldest entries
    if (this.cache.size >= this.cacheMaxSize) {
      const entriesToRemove = this.cache.size - this.cacheMaxSize + 1;
      const sortedEntries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

      for (let i = 0; i < entriesToRemove && i < sortedEntries.length; i++) {
        const [key] = sortedEntries[i];
        this.cache.delete(key);
      }

      this.logger?.debug(`Removed ${entriesToRemove} oldest cache entries to enforce max size`);
    }
  }

  /**
   * Gets cache statistics
   */
  private getCacheStats(): { size: number; enabled: boolean; ttl: number; maxSize: number } {
    return {
      size: this.cache.size,
      enabled: this.cacheEnabled,
      ttl: this.cacheTtl,
      maxSize: this.cacheMaxSize
    };
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
  public async initialize(logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.info(`Initialized MultiJsonCommandProvider with command: "${this.command}"`);
    this.logger.info(`Template: "${this.template}"`);
    this.logger.info(`Unique key: "${this.uniqueKey}"`);
    this.logger.info(`Throttle delay: ${this.throttleDelay}ms`);
    
    // Log cache configuration
    if (this.cacheEnabled) {
      this.logger.info(`Cache enabled: TTL=${this.cacheTtl}ms, Max size=${this.cacheMaxSize}`);
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
      
      // Log cache stats after validation (should be 0 since we skipped caching)
      if (this.cacheEnabled) {
        const stats = this.getCacheStats();
        this.logger.info(`Cache stats after validation: ${stats.size} entries`);
      }
    } catch (error) {
      this.skipCaching = false; // Reset flag even on error
      this.logger.warn(`Multi JSON command provider validation failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw here - let it fail during actual execution
    }
  }
}