import { Logger } from '../../utils/logger';
import { JsonTemplateProcessor, AttachmentConfig } from '../../utils/jsonTemplateProcessor';
import { MessageWithAttachments } from '../messageProvider';

/**
 * Handles template processing and message generation for multi-JSON providers.
 * Responsible for applying templates to JSON data and extracting attachments.
 */
export class TemplateProcessor {
  private logger: Logger;
  private jsonTemplateProcessor: JsonTemplateProcessor;

  constructor(logger: Logger) {
    this.logger = logger;
    this.jsonTemplateProcessor = new JsonTemplateProcessor(logger);
  }

  /**
   * Processes a single JSON item with the template and extracts attachments
   */
  public processItem(
    item: Record<string, unknown>, 
    template: string,
    attachmentConfig: AttachmentConfig,
    uniqueId: string
  ): MessageWithAttachments {
    try {
      // Apply template to generate message text
      const messageText = this.jsonTemplateProcessor.applyTemplate(template, item);
      
      // Extract attachments if configured
      const attachments = this.jsonTemplateProcessor.extractAttachments(item, attachmentConfig);
      
      this.logger.debug(`Processed item ${uniqueId}: "${messageText}"${attachments.length > 0 ? ` with ${attachments.length} attachments` : ''}`);
      
      return {
        text: messageText,
        attachments: attachments.length > 0 ? attachments : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process item ${uniqueId}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validates that a processed message is not empty
   */
  public isValidMessage(messageData: MessageWithAttachments): boolean {
    return messageData.text.trim().length > 0;
  }

  /**
   * Creates attachment configuration from provider config
   */
  public createAttachmentConfig(config: {
    attachmentsKey?: string;
    attachmentDataKey?: string;
    attachmentMimeTypeKey?: string;
    attachmentFilenameKey?: string;
    attachmentDescriptionKey?: string;
  }): AttachmentConfig {
    return {
      attachmentsKey: config.attachmentsKey,
      attachmentDataKey: config.attachmentDataKey || 'data',
      attachmentMimeTypeKey: config.attachmentMimeTypeKey || 'mimeType',
      attachmentFilenameKey: config.attachmentFilenameKey || 'filename',
      attachmentDescriptionKey: config.attachmentDescriptionKey || 'description'
    };
  }
}