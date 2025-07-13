import { MessageProvider, MessageProviderConfig, MessageWithAttachments } from '../messageProvider';
import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';
import { JsonArrayProcessor } from './JsonArrayProcessor';
import { MessageDeduplicator } from './MessageDeduplicator';
import { TemplateProcessor } from './TemplateProcessor';
import { ExecutionScheduler } from './ExecutionScheduler';

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
    if (!config.command) {
      throw new Error('Command is required for MultiJsonCommandProvider');
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
    
    // Set up deduplicator with cache directory
    const cacheDir = this.config.cache?.filePath ? 
      require('path').dirname(this.config.cache.filePath) : './cache';
    this.deduplicator = new MessageDeduplicator(cacheDir, logger);
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

  /**
   * Generates a message by executing the command and processing one unprocessed item
   */
  public async generateMessage(): Promise<string> {
    if (!this.logger) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    const span = this.telemetry?.startSpan('multijson.generate_message', {
      'provider.name': this.providerName,
      'provider.type': 'multijson',
    });

    try {
      // Execute command to get JSON data
      const jsonData = await this.scheduler.executeCommand({
        command: this.config.command,
        timeout: this.config.timeout,
        cwd: this.config.cwd,
        env: this.config.env,
        maxBuffer: this.config.maxBuffer
      });

      // Process and validate JSON array
      const validItems = this.jsonProcessor.validateAndProcessJson(jsonData);
      
      if (validItems.length === 0) {
        this.logger.info('No valid items found in JSON data');
        span?.setStatus({ code: 1 }); // OK
        return '';
      }

      // Validate unique keys
      this.jsonProcessor.validateUniqueKeys(validItems, this.config.uniqueKey!);

      // Load processed items from cache
      const processedItems = this.config.cache?.enabled !== false ? 
        this.deduplicator.loadProcessedItems(this.providerName) : new Set<string>();

      // Filter out already processed items
      const { unprocessed, skipped } = this.deduplicator.filterUnprocessedItems(
        validItems, 
        processedItems, 
        this.config.uniqueKey!
      );

      if (unprocessed.length === 0) {
        this.logger.info(`All ${validItems.length} items have been processed already`);
        span?.setStatus({ code: 1 }); // OK
        return '';
      }

      // Process the first unprocessed item
      const item = unprocessed[0];
      this.logger.debug(`Processing item at index 0 of ${unprocessed.length} unprocessed items`);
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
          this.deduplicator.saveProcessedItems(this.providerName, processedItems);
        }
        span?.setStatus({ code: 1 }); // OK
        return '';
      }

      // Mark item as processed and save cache
      this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
      if (this.config.cache?.enabled !== false) {
        this.deduplicator.saveProcessedItems(this.providerName, processedItems);
      }

      this.logger.info(`Generated message from item ${uniqueId}: "${messageData.text}"`);
      
      span?.setAttributes({
        'multijson.total_items': validItems.length,
        'multijson.unprocessed_items': unprocessed.length,
        'multijson.skipped_items': skipped,
        'multijson.unique_id': uniqueId,
        'multijson.message_length': messageData.text.length,
        'multijson.has_attachments': !!messageData.attachments,
        'multijson.attachments_count': messageData.attachments?.length || 0,
      });
      span?.setStatus({ code: 1 }); // OK

      return messageData.text;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`MultiJsonCommandProvider failed: ${errorMessage}`);
      
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR
      
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Generates a message with attachments by executing the command and processing one unprocessed item
   */
  public async generateMessageWithAttachments(): Promise<MessageWithAttachments> {
    if (!this.logger) {
      throw new Error('Logger not set. Call setLogger() before using the provider.');
    }

    const span = this.telemetry?.startSpan('multijson.generate_message_with_attachments', {
      'provider.name': this.providerName,
      'provider.type': 'multijson',
    });

    try {
      // Execute command to get JSON data
      const jsonData = await this.scheduler.executeCommand({
        command: this.config.command,
        timeout: this.config.timeout,
        cwd: this.config.cwd,
        env: this.config.env,
        maxBuffer: this.config.maxBuffer
      });

      // Process and validate JSON array
      const validItems = this.jsonProcessor.validateAndProcessJson(jsonData);
      
      if (validItems.length === 0) {
        this.logger.info('No valid items found in JSON data');
        span?.setStatus({ code: 1 }); // OK
        return { text: '', attachments: undefined };
      }

      // Validate unique keys
      this.jsonProcessor.validateUniqueKeys(validItems, this.config.uniqueKey!);

      // Load processed items from cache
      const processedItems = this.config.cache?.enabled !== false ? 
        this.deduplicator.loadProcessedItems(this.providerName) : new Set<string>();

      // Filter out already processed items
      const { unprocessed } = this.deduplicator.filterUnprocessedItems(
        validItems, 
        processedItems, 
        this.config.uniqueKey!
      );

      if (unprocessed.length === 0) {
        this.logger.info(`All ${validItems.length} items have been processed already`);
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
          this.deduplicator.saveProcessedItems(this.providerName, processedItems);
        }
        span?.setStatus({ code: 1 }); // OK
        return { text: '', attachments: undefined };
      }

      // Mark item as processed and save cache
      this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
      if (this.config.cache?.enabled !== false) {
        this.deduplicator.saveProcessedItems(this.providerName, processedItems);
      }

      this.logger.info(`Generated message with attachments from item ${uniqueId}: "${messageData.text}"`);
      
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
      this.logger?.error(`MultiJsonCommandProvider failed: ${errorMessage}`);
      
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR
      
      throw error;
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
   * Cleanup method for cache maintenance
   */
  public cleanup(): void {
    if (this.config.cache?.enabled !== false) {
      this.deduplicator.cleanupOldCacheFiles(this.config.cache?.ttl);
    }
  }
}