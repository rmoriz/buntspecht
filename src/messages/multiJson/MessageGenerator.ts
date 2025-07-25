import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { FileReader } from '../../utils/fileReader';
import { JsonArrayProcessor } from './JsonArrayProcessor';
import { MessageDeduplicator } from './MessageDeduplicator';
import { TemplateProcessor } from './TemplateProcessor';
import { ExecutionScheduler } from './ExecutionScheduler';
import { MessageWithAttachments, Attachment } from '../messageProvider';

/**
 * Configuration for message generation
 */
export interface MessageGenerationConfig {
  command?: string;
  file?: string;
  template: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  maxBuffer?: number;
  uniqueKey: string;
  attachmentsKey?: string;
  attachmentDataKey: string;
  attachmentMimeTypeKey: string;
  attachmentFilenameKey: string;
  attachmentDescriptionKey: string;
  cache?: {
    enabled?: boolean;
    ttl?: number;
    maxSize?: number;
    filePath?: string;
  };
}

/**
 * Result of message generation process
 */
export interface MessageGenerationResult {
  text: string;
  attachments?: Attachment[];
  metadata: {
    totalItems: number;
    unprocessedItems: number;
    skippedItems: number;
    uniqueId: string;
    messageLength: number;
    hasAttachments: boolean;
    attachmentsCount: number;
  };
}

/**
 * Core message generation logic extracted from MultiJsonCommandProvider
 * Handles the common workflow of processing JSON data and generating messages
 */
export class MessageGenerator {
  private logger: Logger;
  private telemetry?: TelemetryService;
  private providerName: string;
  
  private jsonProcessor: JsonArrayProcessor;
  private deduplicator: MessageDeduplicator;
  private templateProcessor: TemplateProcessor;
  private scheduler: ExecutionScheduler;
  private fileReader: FileReader;

  constructor(
    logger: Logger,
    providerName: string,
    cacheDir: string,
    telemetry?: TelemetryService
  ) {
    this.logger = logger;
    this.telemetry = telemetry;
    this.providerName = providerName;
    
    // Initialize components
    this.jsonProcessor = new JsonArrayProcessor(logger);
    this.deduplicator = new MessageDeduplicator(cacheDir, logger);
    this.templateProcessor = new TemplateProcessor(logger);
    this.scheduler = new ExecutionScheduler(logger, telemetry);
    this.fileReader = new FileReader(logger);
  }

  /**
   * Generate a message with full metadata
   */
  public async generateMessage(
    config: MessageGenerationConfig,
    accountName?: string
  ): Promise<MessageGenerationResult | null> {
    return await TelemetryHelper.executeWithSpan(
      this.telemetry,
      'multijson.generate_message_core',
      {
        'provider.name': this.providerName,
        'provider.type': 'multijson',
        'provider.account': accountName || 'default',
      },
      async (span) => {
        // Get JSON data from command or file
        const jsonData = await this.getJsonData(config);
        if (jsonData === null) {
          this.logger.debug('No JSON data available, skipping message generation');
          return null;
        }

        // Validate JSON array
        const validItems = this.jsonProcessor.validateAndProcessJson(jsonData);
        
        if (validItems.length === 0) {
          this.logger.info('No valid items found in JSON data');
          return null;
        }

        // Validate unique keys
        this.jsonProcessor.validateUniqueKeys(validItems, config.uniqueKey);

        // Load processed items from cache
        const cacheKey = this.getCacheKey(accountName);
        const processedItems = config.cache?.enabled !== false ? 
          this.deduplicator.loadProcessedItems(cacheKey) : new Set<string>();

        // Filter out already processed items
        const { unprocessed, skipped } = this.deduplicator.filterUnprocessedItems(
          validItems, 
          processedItems, 
          config.uniqueKey
        );

        if (unprocessed.length === 0) {
          this.logger.info(`All ${validItems.length} items have been processed already for account: ${accountName || 'default'}`);
          return null;
        }

        // Process the first unprocessed item
        const item = unprocessed[0];
        this.logger.debug(`Processing item at index 0 of ${unprocessed.length} unprocessed items for account: ${accountName || 'default'}`);
        const uniqueId = this.jsonProcessor.getUniqueId(item, config.uniqueKey, 0);

        // Create attachment configuration
        const attachmentConfig = this.templateProcessor.createAttachmentConfig({
          attachmentsKey: config.attachmentsKey,
          attachmentDataKey: config.attachmentDataKey,
          attachmentMimeTypeKey: config.attachmentMimeTypeKey,
          attachmentFilenameKey: config.attachmentFilenameKey,
          attachmentDescriptionKey: config.attachmentDescriptionKey
        });

        // Process the item with template
        const messageData = this.templateProcessor.processItem(
          item,
          config.template,
          attachmentConfig,
          uniqueId
        );

        // Validate the generated message
        if (!this.templateProcessor.isValidMessage(messageData)) {
          this.logger.info(`Generated empty message for item ${uniqueId}, skipping`);
          // Mark as processed even if empty to avoid reprocessing
          this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
          if (config.cache?.enabled !== false) {
            this.deduplicator.saveProcessedItems(cacheKey, processedItems);
          }
          return null;
        }

        // Mark item as processed and save cache
        this.deduplicator.markItemAsProcessed(processedItems, uniqueId);
        if (config.cache?.enabled !== false) {
          this.deduplicator.saveProcessedItems(cacheKey, processedItems);
        }

        this.logger.info(`Generated message from item ${uniqueId} for account ${accountName || 'default'}: "${messageData.text}"`);
        
        const metadata = {
          totalItems: validItems.length,
          unprocessedItems: unprocessed.length,
          skippedItems: skipped,
          uniqueId: uniqueId,
          messageLength: messageData.text.length,
          hasAttachments: !!messageData.attachments,
          attachmentsCount: messageData.attachments?.length || 0,
        };

        TelemetryHelper.setAttributes(span, {
          'multijson.total_items': metadata.totalItems,
          'multijson.unprocessed_items': metadata.unprocessedItems,
          'multijson.skipped_items': metadata.skippedItems,
          'multijson.unique_id': metadata.uniqueId,
          'multijson.message_length': metadata.messageLength,
          'multijson.has_attachments': metadata.hasAttachments,
          'multijson.attachments_count': metadata.attachmentsCount,
        });

        return {
          text: messageData.text,
          attachments: messageData.attachments,
          metadata
        };
      }
    );
  }

  /**
   * Get JSON data from command or file
   */
  private async getJsonData(config: MessageGenerationConfig): Promise<unknown | null> {
    if (config.command) {
      return await this.scheduler.executeCommand({
        command: config.command,
        timeout: config.timeout,
        cwd: config.cwd,
        env: config.env,
        maxBuffer: config.maxBuffer
      });
    } else if (config.file) {
      const fileContent = await this.readJsonFile(config.file);
      if (fileContent === null) {
        return null;
      }
      
      try {
        return JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON from file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    } else {
      throw new Error('No command or file specified in configuration');
    }
  }

  /**
   * Read JSON data from file with robust error handling
   */
  private async readJsonFile(filePath: string): Promise<string | null> {
    try {
      const fileContent = await this.fileReader.readFileRobust(filePath, {
        maxRetries: 3,
        retryDelay: 100,
        throwOnEmpty: false,
        minFileSize: 1
      });

      if (fileContent === null) {
        this.logger.debug(`File ${filePath} is empty or being written, skipping this iteration`);
        return null;
      }

      this.logger.debug(`Read JSON file: ${filePath} (${fileContent.length} characters)`);
      return fileContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to read JSON file: ${errorMessage}`);
      throw new Error(`Failed to read JSON file: ${errorMessage}`);
    }
  }

  /**
   * Get cache key for the provider and account
   */
  private getCacheKey(accountName?: string): string {
    return accountName ? `${this.providerName}:${accountName}` : this.providerName;
  }
}