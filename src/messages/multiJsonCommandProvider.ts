import { MessageProvider, MessageProviderConfig, MessageWithAttachments, Attachment } from './messageProvider';
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
  attachmentsKey?: string; // JSON key containing base64 attachments array (optional)
  attachmentDataKey?: string; // JSON key for base64 data within each attachment (default: "data")
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
  private attachmentsKey?: string;
  private attachmentDataKey: string;
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
  private cacheFileWatcher?: fs.FSWatcher;
  private lastCacheFileModTime?: number;

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
    this.attachmentsKey = config.attachmentsKey;
    this.attachmentDataKey = config.attachmentDataKey || 'data';
    
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
   * @param accountName Optional account name for account-aware caching
   */
  public async generateMessage(accountName?: string): Promise<string> {
    const result = await this.generateMessageWithAttachments(accountName);
    return result.text;
  }

  /**
   * Generates a single message with attachments by executing the configured command, parsing JSON array output,
   * and returning the next unprocessed object as a message with attachments
   * @param accountName Optional account name for account-aware caching
   */
  public async generateMessageWithAttachments(accountName?: string): Promise<MessageWithAttachments> {
    // Check if cache file has been modified externally and reload if necessary
    await this.checkAndReloadCacheIfModified();
    
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
        return { text: '', attachments: undefined };
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
      
      // Find the first unprocessed object for this account
      const nextObject = await this.findNextUnprocessedObject(objects, accountName);
      
      if (!nextObject) {
        this.logger?.info(`All objects have been processed (cached) for account "${accountName || 'default'}", no new messages to send`);
        return { text: '', attachments: undefined };
      }
      
      // Process the single object for this account
      const result = await this.processSingleObjectWithAttachments(nextObject, accountName);
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Multi JSON command execution failed: ${errorMessage}`);
      throw new Error(`Failed to execute multi JSON command: ${errorMessage}`);
    }
  }

  /**
   * Finds the first unprocessed object from the array for a specific account
   */
  private async findNextUnprocessedObject(objects: Record<string, unknown>[], accountName?: string): Promise<Record<string, unknown> | null> {
    let cachedCount = 0;
    
    // Find the first non-cached item
    for (const obj of objects) {
      const uniqueId = String(obj[this.uniqueKey]);
      
      if (this.isItemCached(uniqueId, accountName)) {
        cachedCount++;
        this.logger?.debug(`Skipping cached item: ${this.uniqueKey}="${uniqueId}" (account: ${accountName || 'default'})`);
        
        // Record telemetry for cached items
        if (this.telemetry) {
          this.telemetry.incrementCounter('messages_cached_skip', 1, { 
            provider: this.getProviderName(),
            account: accountName || 'default'
          });
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
   * Processes a single object and generates a message for a specific account
   */
  private async processSingleObject(obj: Record<string, unknown>, accountName?: string): Promise<string> {
    const result = await this.processSingleObjectWithAttachments(obj, accountName);
    return result.text;
  }

  /**
   * Processes a single object and generates a message with attachments for a specific account
   */
  private async processSingleObjectWithAttachments(obj: Record<string, unknown>, accountName?: string): Promise<MessageWithAttachments> {
    try {
      const uniqueId = String(obj[this.uniqueKey]);
      
      // Apply template with JSON variables
      const message = this.applyTemplate(this.template, obj);
      
      // Extract attachments if configured
      const attachments = this.extractAttachments(obj);
      
      this.logger?.debug(`Generated message for ${this.uniqueKey}="${uniqueId}" (account: ${accountName || 'default'}): "${message}"`);
      if (attachments.length > 0) {
        this.logger?.debug(`Found ${attachments.length} attachments for ${this.uniqueKey}="${uniqueId}"`);
      }
      
      // Add to cache after successful message generation
      await this.addToCache(uniqueId, accountName);
      
      // Record telemetry
      if (this.telemetry) {
        this.telemetry.incrementCounter('messages_generated', 1, { 
          provider: this.getProviderName(),
          account: accountName || 'default'
        });
      }
      
      return {
        text: message,
        attachments: attachments.length > 0 ? attachments : undefined
      };
      
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
   * Supports syntax like {{variable}}, {{nested.property}}, and {{variable|trim:50}}
   */
  private applyTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const trimmedExpression = expression.trim();
      
      // Check if expression contains a function call (pipe syntax)
      const pipeIndex = trimmedExpression.indexOf('|');
      let path: string;
      let functionCall: string | null = null;
      
      if (pipeIndex !== -1) {
        path = trimmedExpression.substring(0, pipeIndex).trim();
        functionCall = trimmedExpression.substring(pipeIndex + 1).trim();
      } else {
        path = trimmedExpression;
      }
      
      const value = this.getNestedProperty(data, path);
      
      if (value === undefined || value === null) {
        this.logger?.warn(`Template variable "${path}" not found in JSON data`);
        return match; // Return the original placeholder if variable not found
      }
      
      let result = String(value);
      
      // Apply function if specified
      if (functionCall) {
        result = this.applyTemplateFunction(result, functionCall, path);
      }
      
      return result;
    });
  }

  /**
   * Applies a template function to a value
   * Currently supports: trim:length
   */
  private applyTemplateFunction(value: string, functionCall: string, variablePath: string): string {
    const colonIndex = functionCall.indexOf(':');
    let functionName: string;
    let functionArgs: string[] = [];
    
    if (colonIndex !== -1) {
      functionName = functionCall.substring(0, colonIndex).trim();
      const argsString = functionCall.substring(colonIndex + 1);
      // Split by comma but preserve commas within the suffix argument
      const firstCommaIndex = argsString.indexOf(',');
      if (firstCommaIndex !== -1) {
        functionArgs = [
          argsString.substring(0, firstCommaIndex).trim(),
          argsString.substring(firstCommaIndex + 1).trim()
        ];
      } else {
        functionArgs = [argsString.trim()];
      }
    } else {
      functionName = functionCall.trim();
    }
    
    switch (functionName) {
      case 'trim':
        return this.trimFunction(value, functionArgs, variablePath);
      default:
        this.logger?.warn(`Unknown template function "${functionName}" for variable "${variablePath}"`);
        return value; // Return original value if function is unknown
    }
  }

  /**
   * Trims a string to a specified maximum length
   * Usage: {{variable|trim:50}} or {{variable|trim:50,...}}
   * Args: [maxLength, suffix?]
   */
  private trimFunction(value: string, args: string[], variablePath: string): string {
    if (args.length === 0) {
      this.logger?.warn(`trim function requires at least one argument (maxLength) for variable "${variablePath}"`);
      return value;
    }
    
    const maxLengthStr = args[0];
    const maxLength = parseInt(maxLengthStr, 10);
    
    if (isNaN(maxLength) || maxLength < 0) {
      this.logger?.warn(`Invalid maxLength "${maxLengthStr}" for trim function on variable "${variablePath}". Must be a non-negative integer.`);
      return value;
    }
    
    if (value.length <= maxLength) {
      return value; // No trimming needed
    }
    
    // Optional suffix (default: "...")
    const suffix = args.length > 1 ? args[1] : '...';
    
    // Special case: if maxLength is 0, return just the suffix
    if (maxLength === 0) {
      return suffix;
    }
    
    // Ensure the suffix doesn't make the result longer than maxLength
    const effectiveMaxLength = Math.max(0, maxLength - suffix.length);
    
    if (effectiveMaxLength <= 0) {
      // If suffix is longer than maxLength, just return the suffix truncated
      return suffix.substring(0, maxLength);
    }
    
    return value.substring(0, effectiveMaxLength) + suffix;
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
   * Extracts attachments from JSON data if attachmentsKey is configured
   */
  private extractAttachments(jsonData: Record<string, unknown>): Attachment[] {
    if (!this.attachmentsKey) {
      return [];
    }

    const attachmentsData = this.getNestedProperty(jsonData, this.attachmentsKey);
    
    if (!Array.isArray(attachmentsData)) {
      if (attachmentsData !== undefined && attachmentsData !== null) {
        this.logger?.warn(`Attachments key "${this.attachmentsKey}" exists but is not an array`);
      }
      return [];
    }

    const attachments: Attachment[] = [];
    
    for (let i = 0; i < attachmentsData.length; i++) {
      const item = attachmentsData[i];
      
      if (typeof item !== 'object' || item === null) {
        this.logger?.warn(`Attachment at index ${i} is not an object`);
        continue;
      }
      
      const attachmentObj = item as Record<string, unknown>;
      
      // Validate required fields
      if (typeof attachmentObj[this.attachmentDataKey] !== 'string') {
        this.logger?.warn(`Attachment at index ${i} missing or invalid '${this.attachmentDataKey}' field`);
        continue;
      }
      
      // Check for mimeType field (support both "mimeType" and "type")
      const mimeType = (typeof attachmentObj.mimeType === 'string' ? attachmentObj.mimeType : null) || 
                       (typeof attachmentObj.type === 'string' ? attachmentObj.type : null);
      if (!mimeType) {
        this.logger?.warn(`Attachment at index ${i} missing or invalid 'mimeType' or 'type' field`);
        continue;
      }
      
      // Validate base64 data
      const base64Data = attachmentObj[this.attachmentDataKey] as string;
      if (!this.isValidBase64(base64Data)) {
        this.logger?.warn(`Attachment at index ${i} has invalid base64 data in '${this.attachmentDataKey}' field`);
        continue;
      }
      
      const attachment: Attachment = {
        data: base64Data,
        mimeType: mimeType,
        filename: (typeof attachmentObj.filename === 'string' ? attachmentObj.filename : null) || 
                  (typeof attachmentObj.name === 'string' ? attachmentObj.name : null) || 
                  undefined,
        description: (typeof attachmentObj.description === 'string' ? attachmentObj.description : null) || 
                     (typeof attachmentObj.alt === 'string' ? attachmentObj.alt : null) || 
                     undefined,
      };
      
      attachments.push(attachment);
      this.logger?.debug(`Added attachment ${i + 1}: ${attachment.mimeType}${attachment.filename ? ` (${attachment.filename})` : ''}`);
    }
    
    return attachments;
  }

  /**
   * Validates if a string is valid base64
   */
  private isValidBase64(str: string): boolean {
    try {
      // Check if string matches base64 pattern
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(str)) {
        return false;
      }
      
      // Try to decode to verify it's valid base64
      const decoded = Buffer.from(str, 'base64');
      const reencoded = decoded.toString('base64');
      
      // Check if re-encoding gives the same result (handles padding)
      return str === reencoded || str === reencoded.replace(/=+$/, '');
    } catch {
      return false;
    }
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
        const stats = fs.statSync(this.cacheFilePath);
        this.lastCacheFileModTime = stats.mtimeMs;
        
        const fileContent = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const cacheData = JSON.parse(fileContent) as Record<string, CacheEntry>;
        
        // Clear existing cache before loading
        this.cache.clear();
        
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
        this.lastCacheFileModTime = undefined;
      }
    } catch (error) {
      this.logger?.error(`Failed to load cache from file: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without cache rather than failing
      this.cache.clear();
      this.lastCacheFileModTime = undefined;
    }
  }

  /**
   * Checks if the cache file has been modified externally and reloads if necessary
   */
  private async checkAndReloadCacheIfModified(): Promise<void> {
    if (!this.cacheEnabled || !fs.existsSync(this.cacheFilePath)) {
      return;
    }

    try {
      const stats = fs.statSync(this.cacheFilePath);
      const currentModTime = stats.mtimeMs;

      // If we don't have a stored mod time or the file has been modified
      if (!this.lastCacheFileModTime || currentModTime > this.lastCacheFileModTime) {
        this.logger?.info(`Cache file has been modified externally, reloading: ${this.cacheFilePath}`);
        await this.loadCacheFromFile();
        
        // Record telemetry for external cache reload
        if (this.telemetry) {
          this.telemetry.incrementCounter('cache_external_reload', 1, { provider: this.getProviderName() });
        }
      }
    } catch (error) {
      this.logger?.error(`Failed to check cache file modification: ${error instanceof Error ? error.message : String(error)}`);
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

      // Update our stored modification time to prevent unnecessary reloads
      const stats = fs.statSync(this.cacheFilePath);
      this.lastCacheFileModTime = stats.mtimeMs;

      this.logger?.debug(`Saved ${this.cache.size} cache entries to ${this.cacheFilePath}`);
    } catch (error) {
      this.logger?.error(`Failed to save cache to file: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw - cache save failure shouldn't break the provider
    }
  }

  /**
   * Creates a cache key combining provider name, account name, and unique key value
   * This ensures that the same content can be posted to different accounts independently
   */
  private createCacheKey(uniqueKeyValue: string, accountName?: string): string {
    if (accountName) {
      return `${this.providerName}:${accountName}:${uniqueKeyValue}`;
    }
    // Fallback for backward compatibility when no account name is provided
    return `${this.providerName}:${uniqueKeyValue}`;
  }

  /**
   * Checks if an item is already cached (and not expired) for a specific account
   */
  private isItemCached(uniqueKeyValue: string, accountName?: string): boolean {
    if (!this.cacheEnabled || this.skipCaching) {
      return false;
    }

    const cacheKey = this.createCacheKey(uniqueKeyValue, accountName);
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtl) {
      this.cache.delete(cacheKey);
      this.logger?.debug(`Cache entry expired for ${this.uniqueKey}="${uniqueKeyValue}" (account: ${accountName || 'default'})`);
      return false;
    }

    return true;
  }

  /**
   * Adds an item to the cache for a specific account
   */
  private async addToCache(uniqueKeyValue: string, accountName?: string): Promise<void> {
    if (!this.cacheEnabled || this.skipCaching) {
      return;
    }

    // Clean up expired entries and enforce max size
    this.cleanupCache();

    const cacheKey = this.createCacheKey(uniqueKeyValue, accountName);
    const entry: CacheEntry = {
      timestamp: Date.now(),
      uniqueKeyValue: uniqueKeyValue,
      providerName: this.providerName
    };

    this.cache.set(cacheKey, entry);
    this.logger?.debug(`Added to cache: ${this.uniqueKey}="${uniqueKeyValue}" (account: ${accountName || 'default'}, key: ${cacheKey})`);

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
   * Cleanup method to dispose of resources
   */
  public async cleanup(): Promise<void> {
    // Close file watcher if it exists
    if (this.cacheFileWatcher) {
      this.cacheFileWatcher.close();
      this.cacheFileWatcher = undefined;
      this.logger?.debug('Closed cache file watcher');
    }

    // Save cache one final time
    if (this.cacheEnabled && this.cache.size > 0) {
      await this.saveCacheToFile();
    }
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
      await this.generateMessage(); // No account name during validation
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