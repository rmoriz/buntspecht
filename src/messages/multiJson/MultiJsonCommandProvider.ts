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
import { MessageGenerator, MessageGenerationConfig } from './MessageGenerator';
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
  processingOrder?: 'top-bottom' | 'bottom-top'; // Order to process items (default: 'top-bottom')
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
  private messageGenerator?: MessageGenerator;
  private fileWatcher?: FileWatcher;
  private pendingFileChangeCallback?: () => void;
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
    
    // Initialize message generator
    this.messageGenerator = new MessageGenerator(logger, this.providerName || 'multijsoncommand', cacheDir, this.telemetry);
    
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
      // Update message generator with telemetry
      const cacheDir = this.config.cache?.filePath ? 
        require('path').dirname(this.config.cache.filePath) : './cache';
      this.messageGenerator = new MessageGenerator(this.logger, this.providerName || 'multijsoncommand', cacheDir, telemetry);
    }
  }

  public setProviderName(name: string): void {
    this.providerName = name;
  }

  public getProviderName(): string {
    return 'multijsoncommand';
  }

  private getCacheKey(accountName?: string): string {
    const providerName = this.providerName || 'multijsoncommand';
    return accountName ? `${providerName}:${accountName}` : providerName;
  }

  /**
   * Create message generation config from provider config
   */
  private createMessageGenerationConfig(): MessageGenerationConfig {
    return {
      command: this.config.command,
      file: this.config.file,
      template: this.config.template,
      timeout: this.config.timeout,
      cwd: this.config.cwd,
      env: this.config.env,
      maxBuffer: this.config.maxBuffer,
      uniqueKey: this.config.uniqueKey!,
      attachmentsKey: this.config.attachmentsKey,
      attachmentDataKey: this.config.attachmentDataKey!,
      attachmentMimeTypeKey: this.config.attachmentMimeTypeKey!,
      attachmentFilenameKey: this.config.attachmentFilenameKey!,
      attachmentDescriptionKey: this.config.attachmentDescriptionKey!,
      processingOrder: this.config.processingOrder || 'top-bottom',
      cache: this.config.cache
    };
  }

  /**
   * Generates a message by executing the command and processing one unprocessed item
   */
  public async generateMessage(accountName?: string): Promise<string> {
    if (!this.logger || !this.messageGenerator) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    const config = this.createMessageGenerationConfig();
    const result = await this.messageGenerator!.generateMessage(config, accountName);
    
    return result?.text || '';
  }

  /**
   * Generates a message with attachments by executing the command and processing one unprocessed item
   */
  public async generateMessageWithAttachments(accountName?: string): Promise<MessageWithAttachments> {
    if (!this.logger || !this.messageGenerator) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    return await TelemetryHelper.executeWithSpan(
      this.telemetry,
      'multijson.generate_message_with_attachments',
      {
        'provider.name': this.providerName,
        'provider.type': 'multijson',
        'provider.account': accountName || 'default',
      },
      async (span) => {
        const config = this.createMessageGenerationConfig();
        const result = await this.messageGenerator!.generateMessage(config, accountName);
        
        if (!result) {
          return { text: '', attachments: undefined };
        }

        // Set telemetry attributes from the result metadata
        TelemetryHelper.setAttributes(span, {
          'multijson.total_items': result.metadata.totalItems,
          'multijson.unprocessed_items': result.metadata.unprocessedItems,
          'multijson.unique_id': result.metadata.uniqueId,
          'multijson.message_length': result.metadata.messageLength,
          'multijson.has_attachments': result.metadata.hasAttachments,
          'multijson.attachments_count': result.metadata.attachmentsCount,
        });

        return {
          text: result.text,
          attachments: result.attachments
        };
      }
    );
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
      let jsonData: unknown;
      if (this.config.command) {
        jsonData = await this.scheduler.executeCommand({
          command: this.config.command!,
          timeout: this.config.timeout,
          cwd: this.config.cwd,
          env: this.config.env,
          maxBuffer: this.config.maxBuffer,
        });
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
    // Ensure provider name is set to avoid empty cache keys
    if (!this.providerName) {
      this.providerName = 'multijsoncommand';
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
    
    // Apply any pending callback that was set before the watcher was ready
    if (this.pendingFileChangeCallback) {
      this.fileWatcher.setChangeCallback(this.pendingFileChangeCallback);
      this.pendingFileChangeCallback = undefined;
    }
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
    if (this.fileWatcher) {
      // FileWatcher is ready, set callback immediately
      this.fileWatcher.setChangeCallback(callback);
    } else {
      // FileWatcher not ready yet, store callback for later
      this.pendingFileChangeCallback = callback;
    }
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