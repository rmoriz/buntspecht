import { Logger } from './logger';
import { Attachment } from '../messages/messageProvider';

/**
 * Configuration for attachment extraction
 */
export interface AttachmentConfig {
  attachmentsKey?: string;
  attachmentDataKey?: string;
  attachmentMimeTypeKey?: string;
  attachmentFilenameKey?: string;
  attachmentDescriptionKey?: string;
}

/**
 * Shared utility class for JSON template processing and attachment extraction
 * Used by JSON Command Provider, Multi-JSON Command Provider, and Webhook Server
 */
export class JsonTemplateProcessor {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Applies a template string with variables from JSON data
   * Supports syntax like {{variable}}, {{nested.property}}, and {{variable|trim:50}}
   */
  public applyTemplate(template: string, data: Record<string, unknown>): string {
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
        this.logger.warn(`Template variable "${path}" not found in JSON data`);
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
        this.logger.warn(`Unknown template function "${functionName}" for variable "${variablePath}"`);
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
      this.logger.warn(`trim function requires at least one argument (maxLength) for variable "${variablePath}"`);
      return value;
    }
    
    const maxLengthStr = args[0];
    const maxLength = parseInt(maxLengthStr, 10);
    
    if (isNaN(maxLength) || maxLength < 0) {
      this.logger.warn(`Invalid maxLength "${maxLengthStr}" for trim function on variable "${variablePath}". Must be a non-negative integer.`);
      return value;
    }
    
    if (value.length <= maxLength) {
      return value; // No trimming needed
    }
    
    // Optional suffix (default: "...")
    const suffix = args.length > 1 ? args[1] : '...';
    
    // Special case: if maxLength is 0, return just the suffix (truncated if needed)
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
  public getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Extracts attachments from JSON data with configurable field mapping
   */
  public extractAttachments(jsonData: Record<string, unknown>, config: AttachmentConfig): Attachment[] {
    if (!config.attachmentsKey) {
      return [];
    }

    const attachmentDataKey = config.attachmentDataKey || 'data';
    const attachmentMimeTypeKey = config.attachmentMimeTypeKey || 'mimeType';
    const attachmentFilenameKey = config.attachmentFilenameKey || 'filename';
    const attachmentDescriptionKey = config.attachmentDescriptionKey || 'description';

    const attachmentsData = this.getNestedProperty(jsonData, config.attachmentsKey);
    
    if (!Array.isArray(attachmentsData)) {
      if (attachmentsData !== undefined && attachmentsData !== null) {
        this.logger.warn(`Attachments key "${config.attachmentsKey}" exists but is not an array`);
      }
      return [];
    }

    const attachments: Attachment[] = [];
    
    for (let i = 0; i < attachmentsData.length; i++) {
      const item = attachmentsData[i];
      
      if (typeof item !== 'object' || item === null) {
        this.logger.warn(`Attachment at index ${i} is not an object`);
        continue;
      }
      
      const attachmentObj = item as Record<string, unknown>;
      
      // Validate required fields
      if (typeof attachmentObj[attachmentDataKey] !== 'string') {
        this.logger.warn(`Attachment at index ${i} missing or invalid '${attachmentDataKey}' field`);
        continue;
      }
      
      // Check for mimeType field (configurable with fallback)
      const mimeType = (typeof attachmentObj[attachmentMimeTypeKey] === 'string' ? attachmentObj[attachmentMimeTypeKey] as string : null) || 
                       (typeof attachmentObj.type === 'string' ? attachmentObj.type as string : null) ||
                       (typeof attachmentObj.mimeType === 'string' ? attachmentObj.mimeType as string : null);
      if (!mimeType) {
        this.logger.warn(`Attachment at index ${i} missing or invalid '${attachmentMimeTypeKey}' field (also checked 'type' and 'mimeType' as fallbacks)`);
        continue;
      }
      
      // Validate base64 data
      const base64Data = attachmentObj[attachmentDataKey] as string;
      if (!this.isValidBase64(base64Data)) {
        this.logger.warn(`Attachment at index ${i} has invalid base64 data in '${attachmentDataKey}' field`);
        continue;
      }
      
      const attachment: Attachment = {
        data: base64Data,
        mimeType: mimeType,
        filename: (typeof attachmentObj[attachmentFilenameKey] === 'string' ? attachmentObj[attachmentFilenameKey] as string : null) || 
                  (typeof attachmentObj.name === 'string' ? attachmentObj.name as string : null) ||
                  (typeof attachmentObj.filename === 'string' ? attachmentObj.filename as string : null) || 
                  undefined,
        description: (typeof attachmentObj[attachmentDescriptionKey] === 'string' ? attachmentObj[attachmentDescriptionKey] as string : null) || 
                     (typeof attachmentObj.alt === 'string' ? attachmentObj.alt as string : null) ||
                     (typeof attachmentObj.description === 'string' ? attachmentObj.description as string : null) || 
                     undefined,
      };
      
      attachments.push(attachment);
      this.logger.debug(`Added attachment ${i + 1}: ${attachment.mimeType}${attachment.filename ? ` (${attachment.filename})` : ''}`);
    }
    
    return attachments;
  }

  /**
   * Validates if a string is valid base64
   */
  public isValidBase64(str: string): boolean {
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
}