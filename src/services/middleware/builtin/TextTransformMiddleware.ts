import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface TextTransformConfig {
  /** Transform type */
  transform: 'uppercase' | 'lowercase' | 'capitalize' | 'trim' | 'replace' | 'prepend' | 'append';
  /** For 'replace' transform: search pattern (string or regex) */
  search?: string;
  /** For 'replace' transform: replacement string */
  replacement?: string;
  /** For 'prepend' transform: text to prepend */
  prefix?: string;
  /** For 'append' transform: text to append */
  suffix?: string;
  /** Whether to use regex for replace (default: false) */
  useRegex?: boolean;
  /** Regex flags for replace (default: 'g') */
  regexFlags?: string;
}

/**
 * Middleware for transforming message text
 */
export class TextTransformMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: TextTransformConfig;
  private logger?: Logger;

  constructor(name: string, config: TextTransformConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = config;
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized TextTransformMiddleware: ${this.name} with transform: ${this.config.transform}`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const originalText = context.message.text;
      let transformedText = originalText;

      switch (this.config.transform) {
        case 'uppercase':
          transformedText = originalText.toUpperCase();
          break;
        
        case 'lowercase':
          transformedText = originalText.toLowerCase();
          break;
        
        case 'capitalize':
          transformedText = originalText.charAt(0).toUpperCase() + originalText.slice(1).toLowerCase();
          break;
        
        case 'trim':
          transformedText = originalText.trim();
          break;
        
        case 'replace':
          if (this.config.search !== undefined && this.config.replacement !== undefined) {
            if (this.config.useRegex) {
              const flags = this.config.regexFlags || 'g';
              const regex = new RegExp(this.config.search, flags);
              transformedText = originalText.replace(regex, this.config.replacement);
            } else {
              transformedText = originalText.replace(new RegExp(this.escapeRegex(this.config.search), 'g'), this.config.replacement);
            }
          }
          break;
        
        case 'prepend':
          if (this.config.prefix !== undefined) {
            transformedText = this.config.prefix + originalText;
          }
          break;
        
        case 'append':
          if (this.config.suffix !== undefined) {
            transformedText = originalText + this.config.suffix;
          }
          break;
        
        default:
          this.logger?.warn(`Unknown transform type: ${this.config.transform}`);
      }

      // Update the message
      context.message.text = transformedText;

      if (originalText !== transformedText) {
        this.logger?.debug(`TextTransformMiddleware ${this.name} transformed message: "${originalText}" -> "${transformedText}"`);
        context.data[`${this.name}_original_text`] = originalText;
        context.data[`${this.name}_transformed`] = true;
      }

      // Continue to next middleware
      await next();
    } catch (error) {
      this.logger?.error(`TextTransformMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}