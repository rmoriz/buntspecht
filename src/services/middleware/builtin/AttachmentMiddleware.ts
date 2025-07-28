import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';
import { Attachment } from '../../../messages/messageProvider';

export interface AttachmentConfig {
  /** Action to perform on attachments */
  action: 'add' | 'remove' | 'modify' | 'validate';
  /** For 'add' action: attachments to add */
  attachments?: AttachmentData[];
  /** For 'remove' action: criteria for removal */
  removeFilter?: {
    /** Remove by MIME type pattern */
    mimeType?: string;
    /** Remove by filename pattern */
    filename?: string;
    /** Remove by size (bytes) */
    maxSize?: number;
    /** Remove by index */
    indices?: number[];
  };
  /** For 'modify' action: modifications to apply */
  modifications?: {
    /** Resize images */
    resize?: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
    };
    /** Add watermark */
    watermark?: {
      text?: string;
      image?: string;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    };
    /** Convert format */
    convertTo?: string;
  };
  /** For 'validate' action: validation rules */
  validation?: {
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Allowed MIME types */
    allowedTypes?: string[];
    /** Maximum number of attachments */
    maxCount?: number;
    /** Minimum image dimensions */
    minDimensions?: { width: number; height: number };
    /** Maximum image dimensions */
    maxDimensions?: { width: number; height: number };
  };
  /** Skip message if validation fails */
  skipOnValidationFailure?: boolean;
  /** Custom skip reason */
  skipReason?: string;
}

export interface AttachmentData {
  /** Base64 encoded data or file path */
  data: string;
  /** MIME type */
  mimeType: string;
  /** Optional filename */
  filename?: string;
  /** Optional description/alt text */
  description?: string;
  /** Whether data is a file path (vs base64) */
  isFilePath?: boolean;
}

/**
 * Middleware for managing message attachments
 */
export class AttachmentMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: AttachmentConfig;
  private logger?: Logger;

  constructor(name: string, config: AttachmentConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = config;
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized AttachmentMiddleware: ${this.name} with action: ${this.config.action}`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const originalAttachments = context.message.attachments || [];
      
      switch (this.config.action) {
        case 'add':
          await this.addAttachments(context);
          break;
        
        case 'remove':
          this.removeAttachments(context);
          break;
        
        case 'modify':
          await this.modifyAttachments(context);
          break;
        
        case 'validate':
          const isValid = await this.validateAttachments(context);
          if (!isValid && this.config.skipOnValidationFailure) {
            context.skip = true;
            context.skipReason = this.config.skipReason || 'Attachment validation failed';
            this.logger?.info(`AttachmentMiddleware ${this.name} skipped message: ${context.skipReason}`);
            return;
          }
          break;
      }

      const newAttachments = context.message.attachments || [];
      if (originalAttachments.length !== newAttachments.length) {
        this.logger?.debug(`AttachmentMiddleware ${this.name}: ${originalAttachments.length} -> ${newAttachments.length} attachments`);
        context.data[`${this.name}_original_count`] = originalAttachments.length;
        context.data[`${this.name}_new_count`] = newAttachments.length;
      }

      // Continue to next middleware
      await next();

    } catch (error) {
      this.logger?.error(`AttachmentMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private async addAttachments(context: MessageMiddlewareContext): Promise<void> {
    if (!this.config.attachments || this.config.attachments.length === 0) {
      return;
    }

    if (!context.message.attachments) {
      context.message.attachments = [];
    }

    for (const attachmentData of this.config.attachments) {
      try {
        const attachment = await this.processAttachmentData(attachmentData);
        context.message.attachments.push(attachment);
        this.logger?.debug(`Added attachment: ${attachment.filename || 'unnamed'} (${attachment.mimeType})`);
      } catch (error) {
        this.logger?.error(`Failed to add attachment:`, error);
      }
    }
  }

  private removeAttachments(context: MessageMiddlewareContext): void {
    if (!context.message.attachments || !this.config.removeFilter) {
      return;
    }

    const filter = this.config.removeFilter;
    const originalCount = context.message.attachments.length;

    context.message.attachments = context.message.attachments.filter((attachment, index) => {
      // Remove by index
      if (filter.indices && filter.indices.includes(index)) {
        this.logger?.debug(`Removed attachment at index ${index}`);
        return false;
      }

      // Remove by MIME type
      if (filter.mimeType && this.matchesPattern(attachment.mimeType, filter.mimeType)) {
        this.logger?.debug(`Removed attachment with MIME type: ${attachment.mimeType}`);
        return false;
      }

      // Remove by filename
      if (filter.filename && attachment.filename && this.matchesPattern(attachment.filename, filter.filename)) {
        this.logger?.debug(`Removed attachment with filename: ${attachment.filename}`);
        return false;
      }

      // Remove by size
      if (filter.maxSize && this.getAttachmentSize(attachment) > filter.maxSize) {
        this.logger?.debug(`Removed attachment exceeding size limit: ${this.getAttachmentSize(attachment)} bytes`);
        return false;
      }

      return true;
    });

    const removedCount = originalCount - context.message.attachments.length;
    if (removedCount > 0) {
      this.logger?.debug(`Removed ${removedCount} attachment(s)`);
    }
  }

  private async modifyAttachments(context: MessageMiddlewareContext): Promise<void> {
    if (!context.message.attachments || !this.config.modifications) {
      return;
    }

    // Note: Actual image processing would require additional libraries like sharp or jimp
    // This is a placeholder implementation
    for (const attachment of context.message.attachments) {
      if (this.isImageAttachment(attachment)) {
        this.logger?.debug(`Would modify image attachment: ${attachment.filename || 'unnamed'}`);
        // Placeholder for image modifications
        // In a real implementation, you would:
        // 1. Decode base64 data
        // 2. Apply modifications (resize, watermark, format conversion)
        // 3. Re-encode to base64
      }
    }
  }

  private async validateAttachments(context: MessageMiddlewareContext): Promise<boolean> {
    if (!this.config.validation) {
      return true;
    }

    const validation = this.config.validation;
    const attachments = context.message.attachments || [];

    // Check attachment count
    if (validation.maxCount && attachments.length > validation.maxCount) {
      this.logger?.warn(`Too many attachments: ${attachments.length} > ${validation.maxCount}`);
      return false;
    }

    // Validate each attachment
    for (const attachment of attachments) {
      // Check file size
      if (validation.maxSize) {
        const size = this.getAttachmentSize(attachment);
        if (size > validation.maxSize) {
          this.logger?.warn(`Attachment too large: ${size} > ${validation.maxSize} bytes`);
          return false;
        }
      }

      // Check MIME type
      if (validation.allowedTypes && !validation.allowedTypes.includes(attachment.mimeType)) {
        this.logger?.warn(`Disallowed MIME type: ${attachment.mimeType}`);
        return false;
      }

      // Check image dimensions (placeholder - would need image processing library)
      if (this.isImageAttachment(attachment)) {
        // In a real implementation, you would decode the image and check dimensions
        this.logger?.debug(`Would validate image dimensions for: ${attachment.filename || 'unnamed'}`);
      }
    }

    return true;
  }

  private async processAttachmentData(attachmentData: AttachmentData): Promise<Attachment> {
    let data = attachmentData.data;

    if (attachmentData.isFilePath) {
      // Read file and convert to base64
      try {
        const fs = await import('fs');
        const fileBuffer = fs.readFileSync(attachmentData.data);
        data = fileBuffer.toString('base64');
      } catch (error) {
        throw new Error(`Failed to read file: ${attachmentData.data}`);
      }
    }

    return {
      data,
      mimeType: attachmentData.mimeType,
      filename: attachmentData.filename,
      description: attachmentData.description
    };
  }

  private matchesPattern(value: string, pattern: string): boolean {
    // Simple pattern matching - supports wildcards
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(value);
  }

  private getAttachmentSize(attachment: Attachment): number {
    // Estimate size from base64 data
    // Base64 encoding increases size by ~33%
    return Math.floor((attachment.data.length * 3) / 4);
  }

  private isImageAttachment(attachment: Attachment): boolean {
    return attachment.mimeType.startsWith('image/');
  }
}