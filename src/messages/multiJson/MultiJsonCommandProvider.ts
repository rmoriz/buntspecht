import { MessageProvider, MessageProviderConfig, MessageWithAttachments } from '../messageProvider';
import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { FileWatcher } from '../../utils/fileWatcher';
import { FileReader } from '../../utils/fileReader';
import { JsonArrayProcessor } from './JsonArrayProcessor';
import { MessageDeduplicator } from './MessageDeduplicator';
import { TemplateProcessor } from './TemplateProcessor';
import { ExecutionScheduler } from './ExecutionScheduler';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration for the Multi JSON Command message provider
 */
export interface MultiJsonCommandProviderConfig extends MessageProviderConfig {
  command?: string; // Command to execute (mutually exclusive with file)
  file?: string; // Path to JSON file (mutually exclusive with command)
  template: string;
  timeout?: number; // Timeout in milliseconds (default: 30000)
  cwd?: string; // Working directory for the command
  env?: Record<string, string>; // Environment variables
  maxBuffer?: number; // Maximum buffer size for stdout/stderr (default: 1024 * 1024)
  uniqueKey?: string; // Unique key field name (default: "id")
  throttleDelay?: number; // DEPRECATED: Use cron schedule instead for timing between messages
  attachmentsKey?: string; // JSON key containing base64 attachments array (optional)
  attachmentDataKey?: string; // JSON key for base64 data within each attachment (default: "data")
  attachmentMimeTypeKey?: string; // JSON key for MIME type within each attachment (default: "mimeType", fallback: "type")
  attachmentFilenameKey?: string; // JSON key for filename within each attachment (default: "filename", fallback: "name")
  attachmentDescriptionKey?: string; // JSON key for description within each attachment (default: "description", fallback: "alt")
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
 * for each object in the array, sending multiple messages with deduplication
 * 
 * This is a refactored version that uses separate components for better maintainability:
 * - JsonArrayProcessor: Handles JSON parsing and validation
 * - MessageDeduplicator: Manages cache and prevents duplicate messages
 * - TemplateProcessor: Applies templates and extracts attachments
 * - ExecutionScheduler: Manages command execution and timing
 */
export class MultiJsonCommandProvider implements MessageProvider {
  private config: MultiJsonCommandProviderConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;
  private providerName: string = '';
  
  // Component instances
  private jsonProcessor: JsonArrayProcessor;
  private deduplicator: MessageDeduplicator;
  private templateProcessor: TemplateProcessor;
  private scheduler: ExecutionScheduler;
  private fileWatcher?: FileWatcher;
  private fileReader?: FileReader;

  constructor(config: MultiJsonCommandProviderConfig) {
    this.validateConfig(config);
    this.config = {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      uniqueKey: 'id',
      throttleDelay: 1000,
      attachmentDataKey: 'data',
      attachmentMimeTypeKey: 'mimeType',
      attachmentFilenameKey: 'filename',
      attachmentDescriptionKey: 'description',
      cache: {
        enabled: true,
        ttl: 1209600000, // 14 days
        maxSize: 10000,
        filePath: './cache/multijson-cache.json'
      },
      ...config
    };

    // Initialize components (will be properly set up in setLogger)
    this.jsonProcessor = new JsonArrayProcessor(console as any);
    this.deduplicator = new MessageDeduplicator('./cache', console as any);
    this.templateProcessor = new TemplateProcessor(console as any);
    this.scheduler = new ExecutionScheduler(console as any);
  }

  private validateConfig(config: MultiJsonCommandProviderConfig): void {
    // Validate that either command or file is provided, but not both
    if (!config.command && !config.file) {
      throw new Error('Either command or file is required for MultiJsonCommandProvider');
    }
    
    if (config.command && config.file) {
      throw new Error('Cannot specify both command and file for MultiJsonCommandProvider');
    }
    
    if (!config.template) {
      throw new Error('Template is required for MultiJsonCommandProvider');
    }
  }

  public setLogger(logger: Logger): void {
    this.logger = logger;
    
    // Reinitialize components with proper logger
    this.jsonProcessor = new JsonArrayProcessor(logger);
    this.templateProcessor = new TemplateProcessor(logger);
    this.scheduler = new ExecutionScheduler(logger, this.telemetry);
    this.fileReader = new FileReader(logger);
    
    // Set up deduplicator with cache directory
    const cacheDir = this.config.cache?.filePath ? 
      require('path').dirname(this.config.cache.filePath) : './cache';
    this.deduplicator = new MessageDeduplicator(cacheDir, logger);
    
    // Set up file watching if using file mode
    if (this.config.file) {
      this.setupFileWatcher();
    }
  }

  public setTelemetry(telemetry: TelemetryService): void {
    this.telemetry = telemetry;
    // Update scheduler with telemetry
    if (this.logger) {
      this.scheduler = new ExecutionScheduler(this.logger, telemetry);
    }
  }

  public setProviderName(name: string): void {
    this.providerName = name;
  }

  public getProviderName(): string {
    return 'multijsoncommand';
  }

  private getCacheKey(accountName?: string): string {
    return accountName ? `${this.providerName}:${accountName}` : this.providerName;
  }

  /**
   * Generates a message by executing the command and processing one unprocessed item
   */
  public async generateMessage(accountName?: string): Promise<string> {
    if (!this.logger) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    return await TelemetryHelper.executeWithSpan(
      this.telemetry,
      'multijson.generate_message',
      {
        'provider.name': this.providerName,
        'provider.type': 'multijson',
        'provider.account': accountName || 'default',
      },
      async (span) => {
      // Execute command or read file to get JSON data
      let jsonData: unknown;
      if (this.config.command) {
        jsonData = await this.scheduler.executeCommand({
          command: this.config.command!,
          timeout: this.config.timeout,
          cwd: this.config.cwd,
          env: this.config.env,
          maxBuffer: this.config.maxBuffer
        });
      } else if (this.config.file) {
        const fileContent = await this.readJsonFile();
        if (fileContent === null) {
          // File is empty or being written, skip this iteration gracefully
          this.logger!.debug('File is temporarily empty, skipping message generation');
          return '';
        }
        
        // Parse the JSON content
        try {
          jsonData = JSON.parse(fileContent);
        } catch (parseError) {
          throw new Error(`Failed to parse JSON from file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } else {
        throw new Error('No command or file specified in configuration');
      }

      // Validate JSON array
      const validItems = this.jsonProcessor.validateAndProcessJson(jsonData);
      
      if (validItems.length === 0) {
        this.logger!.info('No valid items found in JSON data');
        return '';
      }

      // Validate unique keys
      this.jsonProcessor.validateUniqueKeys(validItems, this.config.uniqueKey!);

      // Load processed items from cache
      const cacheKey = this.getCacheKey(accountName);
      const processedItems = this.config.cache?.enabled !== false ? 
        this.deduplicator.loadProcessedItems(cacheKey) : new Set<string>();

      // Filter out already processed items
      const { unprocessed, skipped } = this.deduplicator.filterUnprocessedItems(
        validItems, 
        processedItems, 
        this.config.uniqueKey!
      );

      if (unprocessed.length === 0) {
        this.logger!.info(`All ${validItems.length} items have been processed already for account: ${accountName || 'default'}`);
        return '';
      }

      // Process the first unprocessed item
      const item = unprocessed[0];
      this.logger!.debug(`Processing item at index 0 of ${unprocessed.length} unprocessed items for account: ${accountName || 'default'}`);
      const uniqueId = this.jsonProcessor.getUniqueId(item, this.config.uniqueKey!, 0);

      // Create attachment configuration
      const attachmentConfig = this.templateProcessor.createAttachmentConfig({
        attachmentsKey: this.config.attachmentsKey,
        attachmentDataKey: this.config.attachmentDataKey,
        attachmentMimeTypeKey: this.config.attachmentMimeTypeKey,
        attachmentFilenameKey: this.config.attachmentFilenameKey,
        attachmentDescriptionKey: this.config.attachmentDescriptionKey
      });

      // Process the item with template
      const messageData = this.templateProcessor.processItem(
        item,
        this.config.template,
        attachmentConfig,
        uniqueId
      );

      // Validate the generated message
      if (!this.templateProcessor.isValidMessage(messageData)) {
        this.logger!.info(`Generated empty message for item ${uniqueId}, skipping`);
        // Mark as processed even if empty to avoid reprocessing
        this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
        if (this.config.cache?.enabled !== false) {
          this.deduplicator.saveProcessedItems(cacheKey, processedItems);
        }
        return '';
      }

      // Mark item as processed and save cache
      this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
      if (this.config.cache?.enabled !== false) {
        this.deduplicator.saveProcessedItems(cacheKey, processedItems);
      }

      this.logger!.info(`Generated message from item ${uniqueId} for account ${accountName || 'default'}: "${messageData.text}"`);
      
      TelemetryHelper.setAttributes(span, {
        'multijson.total_items': validItems.length,
        'multijson.unprocessed_items': unprocessed.length,
        'multijson.skipped_items': skipped,
        'multijson.unique_id': uniqueId,
        'multijson.message_length': messageData.text.length,
        'multijson.has_attachments': !!messageData.attachments,
        'multijson.attachments_count': messageData.attachments?.length || 0,
      });

      return messageData.text;
      }
    );
  }

  /**
   * Generates a message with attachments by executing the command and processing one unprocessed item
   */
  public async generateMessageWithAttachments(accountName?: string): Promise<MessageWithAttachments> {
    if (!this.logger) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    const span = this.telemetry?.startSpan('multijson.generate_message_with_attachments', {
      'provider.name': this.providerName,
      'provider.type': 'multijson',
      'provider.account': accountName || 'default',
    });

    try {
      // Execute command or read file to get JSON data
      let jsonData: unknown;
      if (this.config.command) {
        jsonData = await this.scheduler.executeCommand({
          command: this.config.command!,
          timeout: this.config.timeout,
          cwd: this.config.cwd,
          env: this.config.env,
          maxBuffer: this.config.maxBuffer
        });
      } else if (this.config.file) {
        const fileContent = await this.readJsonFile();
        if (fileContent === null) {
          // File is empty or being written, skip this iteration gracefully
          this.logger.debug('File is temporarily empty, skipping message generation');
          return { text: '', attachments: undefined };
        }
        
        // Parse the JSON content
        try {
          jsonData = JSON.parse(fileContent);
        } catch (parseError) {
          throw new Error(`Failed to parse JSON from file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } else {
        throw new Error('No command or file specified in configuration');
      }

      // Validate JSON array
      const validItems = this.jsonProcessor.validateAndProcessJson(jsonData);
      
      if (validItems.length === 0) {
        this.logger.info('No valid items found in JSON data');
        span?.setStatus({ code: 1 }); // OK
        return { text: '', attachments: undefined };
      }

      // Validate unique keys
      this.jsonProcessor.validateUniqueKeys(validItems, this.config.uniqueKey!);

      // Load processed items from cache
      const cacheKey = this.getCacheKey(accountName);
      const processedItems = this.config.cache?.enabled !== false ? 
        this.deduplicator.loadProcessedItems(cacheKey) : new Set<string>();

      // Filter out already processed items
      const { unprocessed } = this.deduplicator.filterUnprocessedItems(
        validItems, 
        processedItems, 
        this.config.uniqueKey!
      );

      if (unprocessed.length === 0) {
        this.logger.info(`All ${validItems.length} items have been processed already for account: ${accountName || 'default'}`);
        span?.setStatus({ code: 1 }); // OK
        return { text: '', attachments: undefined };
      }

      // Process the first unprocessed item
      const item = unprocessed[0];
      const uniqueId = this.jsonProcessor.getUniqueId(item, this.config.uniqueKey!, 0);

      // Create attachment configuration
      const attachmentConfig = this.templateProcessor.createAttachmentConfig({
        attachmentsKey: this.config.attachmentsKey,
        attachmentDataKey: this.config.attachmentDataKey,
        attachmentMimeTypeKey: this.config.attachmentMimeTypeKey,
        attachmentFilenameKey: this.config.attachmentFilenameKey,
        attachmentDescriptionKey: this.config.attachmentDescriptionKey
      });

      // Process the item with template
      const messageData = this.templateProcessor.processItem(
        item,
        this.config.template,
        attachmentConfig,
        uniqueId
      );

      // Validate the generated message
      if (!this.templateProcessor.isValidMessage(messageData)) {
        this.logger.info(`Generated empty message for item ${uniqueId}, skipping`);
        // Mark as processed even if empty to avoid reprocessing
        this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
        if (this.config.cache?.enabled !== false) {
          this.deduplicator.saveProcessedItems(cacheKey, processedItems);
        }
        span?.setStatus({ code: 1 }); // OK
        return { text: '', attachments: undefined };
      }

      // Mark item as processed and save cache
      this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
      if (this.config.cache?.enabled !== false) {
        this.deduplicator.saveProcessedItems(cacheKey, processedItems);
      }

      this.logger.info(`Generated message with attachments from item ${uniqueId} for account ${accountName || 'default'}: "${messageData.text}"`);
      
      span?.setAttributes({
        'multijson.total_items': validItems.length,
        'multijson.unprocessed_items': unprocessed.length,
        'multijson.unique_id': uniqueId,
        'multijson.message_length': messageData.text.length,
        'multijson.has_attachments': !!messageData.attachments,
        'multijson.attachments_count': messageData.attachments?.length || 0,
      });
      span?.setStatus({ code: 1 }); // OK

      return messageData;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`MultiJsonCommandProvider failed for account ${accountName || 'default'}: ${errorMessage}`);
      
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR
      
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Warms up the cache by processing all items from the JSON source and marking them as processed
   * without generating or sending any messages.
   */
  public async warmCache(accountName?: string): Promise<void> {
    if (!this.logger) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    const cacheKey = this.getCacheKey(accountName);
    this.logger.info(`Warming cache for provider: ${this.providerName}, account: ${accountName || 'default'} (cache key: ${cacheKey})`);

    const span = this.telemetry?.startSpan('multijson.warm_cache', {
      'provider.name': this.providerName,
      'provider.type': 'multijson',
      'provider.account': accountName || 'default',
      'provider.cache_key': cacheKey,
    });

    try {
      // Get JSON data from command or file
      let jsonData: string;
      if (this.config.command) {
        jsonData = String(await this.scheduler.executeCommand({
          command: this.config.command!,
          timeout: this.config.timeout,
          cwd: this.config.cwd,
          env: this.config.env,
          maxBuffer: this.config.maxBuffer,
        }));
      } else if (this.config.file) {
        const fileContent = await this.readJsonFile();
        if (fileContent === null) {
          // File is empty or being written, skip this iteration gracefully
          this.logger!.debug('File is temporarily empty, skipping cache warming');
          return;
        }
        
        // Parse the JSON content
        try {
          jsonData = JSON.parse(fileContent);
        } catch (parseError) {
          throw new Error(`Failed to parse JSON from file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } else {
        throw new Error('Neither command nor file is configured');
      }

      // Process and validate JSON array
      const validItems = this.jsonProcessor.validateAndProcessJson(jsonData);
      
      if (validItems.length === 0) {
        this.logger.info('No valid items found in JSON data, cache warming not needed.');
        span?.setStatus({ code: 1 }); // OK
        return;
      }

      // Validate unique keys
      this.jsonProcessor.validateUniqueKeys(validItems, this.config.uniqueKey!);

      // Load processed items from cache
      const processedItems = this.config.cache?.enabled !== false ? 
        this.deduplicator.loadProcessedItems(cacheKey) : new Set<string>();
      
      const initialCacheSize = processedItems.size;

      // Mark all items as processed
      for (const item of validItems) {
        const uniqueId = this.jsonProcessor.getUniqueId(item, this.config.uniqueKey!, 0);
        this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
      }

      // Save the updated cache
      if (this.config.cache?.enabled !== false) {
        this.deduplicator.saveProcessedItems(cacheKey, processedItems);
      }

      const newItemsCount = processedItems.size - initialCacheSize;
      this.logger.info(`Cache warming complete for provider: ${this.providerName}, account: ${accountName || 'default'}. Added ${newItemsCount} new items to the cache.`);

      span?.setAttributes({
        'multijson.total_items': validItems.length,
        'multijson.new_items_added': newItemsCount,
        'multijson.cache_size': processedItems.size,
      });
      span?.setStatus({ code: 1 }); // OK

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is a common, non-critical error that should not fail cache warming
      const isNonCriticalError = errorMessage.includes('No such file or directory') ||
                                errorMessage.includes('ENOENT') ||
                                errorMessage.includes('Command failed') ||
                                errorMessage.includes('not found');
      
      if (isNonCriticalError) {
        this.logger?.warn(`Cache warming skipped for provider ${this.providerName}, account ${accountName || 'default'}: ${errorMessage}`);
        this.logger?.debug(`Non-critical error details for cache warming:`, error);
        
        // Still create/touch the cache file to mark this provider as processed
        if (this.config.cache?.enabled !== false) {
          const cacheKey = this.getCacheKey(accountName);
          const processedItems = this.deduplicator.loadProcessedItems(cacheKey);
          // Save empty cache to mark provider as processed
          this.deduplicator.saveProcessedItems(cacheKey, processedItems);
          this.logger?.debug(`Created empty cache file for provider ${this.providerName}, account ${accountName || 'default'}`);
        }
        
        span?.setAttributes({
          'multijson.cache_warming_skipped': true,
          'multijson.skip_reason': 'non_critical_error',
          'multijson.cache_file_created': true
        });
        span?.setStatus({ code: 1 }); // OK - treat as successful skip
        return; // Don't throw, just return gracefully
      } else {
        // For other errors, log as error but still don't throw to avoid breaking cache warming
        this.logger?.error(`MultiJsonCommandProvider cache warming failed for account ${accountName || 'default'}: ${errorMessage}`);
        this.logger?.debug(`Cache warming error details:`, error);
        
        span?.recordException(error as Error);
        span?.setStatus({ code: 2, message: errorMessage }); // ERROR
        return; // Don't throw, let cache warming continue with other providers
      }
    } finally {
      span?.end();
    }
  }

  /**
   * Gets provider configuration for debugging
   */
  public getConfig(): MultiJsonCommandProviderConfig {
    return { ...this.config };
  }

  /**
   * Initialize method for compatibility with the old interface
   */
  public async initialize(logger: Logger, telemetry?: TelemetryService, providerName?: string): Promise<void> {
    this.setLogger(logger);
    if (telemetry) {
      this.setTelemetry(telemetry);
    }
    if (providerName) {
      this.setProviderName(providerName);
    }
  }

  /**
   * Read JSON data from file with robust error handling for transient empty files
   */
  private async readJsonFile(): Promise<string | null> {
    if (!this.config.file) {
      throw new Error('No file configured');
    }

    if (!this.fileReader) {
      throw new Error('FileReader not initialized. Call setLogger() first.');
    }

    try {
      // Use robust file reading with retry logic for transient empty files
      const fileContent = await this.fileReader.readFileRobust(this.config.file, {
        maxRetries: 3,
        retryDelay: 100,
        throwOnEmpty: false, // Return null for empty files instead of throwing
        minFileSize: 1
      });

      if (fileContent === null) {
        this.logger?.debug(`File ${this.config.file} is empty or being written, skipping this iteration`);
        return null;
      }

      this.logger?.debug(`Read JSON file: ${this.config.file} (${fileContent.length} characters)`);
      return fileContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to read JSON file: ${errorMessage}`);
      throw new Error(`Failed to read JSON file: ${errorMessage}`);
    }
  }

  /**
   * Set up file watcher for automatic change detection
   */
  private setupFileWatcher(): void {
    if (!this.config.file || !this.logger) {
      return;
    }

    this.fileWatcher = new FileWatcher(this.config.file, this.logger);
    this.fileWatcher.setup();
  }

  /**
   * Check if file has changed since last read
   */
  public hasFileChanged(): boolean {
    return this.fileWatcher?.hasFileChanged() || false;
  }

  /**
   * Set callback for file changes
   */
  public setFileChangeCallback(callback: () => void): void {
    this.fileWatcher?.setChangeCallback(callback);
  }

  /**
   * Cleanup method for cache maintenance and file watchers
   */
  public cleanup(): void {
    if (this.config.cache?.enabled !== false) {
      this.deduplicator.cleanupOldCacheFiles(this.config.cache?.ttl);
    }
    
    // Cleanup file watcher
    if (this.fileWatcher) {
      this.fileWatcher.cleanup();
      this.fileWatcher = undefined;
    }
  }
}