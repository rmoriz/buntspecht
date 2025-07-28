import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface FilterConfig {
  /** Filter type */
  type: 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'regex' | 'length' | 'empty';
  /** Text to search for (for contains, not_contains, starts_with, ends_with) */
  text?: string;
  /** Regex pattern (for regex type) */
  pattern?: string;
  /** Regex flags (for regex type) */
  flags?: string;
  /** Minimum length (for length type) */
  minLength?: number;
  /** Maximum length (for length type) */
  maxLength?: number;
  /** Case sensitive matching (default: false) */
  caseSensitive?: boolean;
  /** Action when filter matches: 'skip' or 'continue' (default: 'skip') */
  action?: 'skip' | 'continue';
  /** Custom skip reason */
  skipReason?: string;
}

/**
 * Middleware for filtering messages based on content
 */
export class FilterMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: FilterConfig;
  private logger?: Logger;

  constructor(name: string, config: FilterConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = config;
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized FilterMiddleware: ${this.name} with type: ${this.config.type}`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const messageText = context.message.text;
      const shouldSkip = this.shouldSkipMessage(messageText);
      const action = this.config.action || 'skip';

      if (shouldSkip && action === 'skip') {
        context.skip = true;
        context.skipReason = this.config.skipReason || `Filtered by ${this.name} (${this.config.type})`;
        this.logger?.info(`FilterMiddleware ${this.name} skipped message: ${context.skipReason}`);
        context.data[`${this.name}_filtered`] = true;
        context.data[`${this.name}_reason`] = context.skipReason;
        return; // Don't call next() - stop the chain
      }

      if (shouldSkip) {
        this.logger?.debug(`FilterMiddleware ${this.name} matched but action is 'continue'`);
        context.data[`${this.name}_matched`] = true;
      }

      // Continue to next middleware
      await next();
    } catch (error) {
      this.logger?.error(`FilterMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private shouldSkipMessage(text: string): boolean {
    const searchText = this.config.caseSensitive ? text : text.toLowerCase();
    const compareText = this.config.caseSensitive ? (this.config.text || '') : (this.config.text || '').toLowerCase();

    switch (this.config.type) {
      case 'contains':
        return this.config.text ? searchText.includes(compareText) : false;
      
      case 'not_contains':
        return this.config.text ? !searchText.includes(compareText) : false;
      
      case 'starts_with':
        return this.config.text ? searchText.startsWith(compareText) : false;
      
      case 'ends_with':
        return this.config.text ? searchText.endsWith(compareText) : false;
      
      case 'regex':
        if (this.config.pattern) {
          const flags = this.config.flags || '';
          const regex = new RegExp(this.config.pattern, flags);
          return regex.test(text);
        }
        return false;
      
      case 'length':
        const length = text.length;
        if (this.config.minLength !== undefined && length < this.config.minLength) {
          return true;
        }
        if (this.config.maxLength !== undefined && length > this.config.maxLength) {
          return true;
        }
        return false;
      
      case 'empty':
        return text.trim() === '';
      
      default:
        this.logger?.warn(`Unknown filter type: ${this.config.type}`);
        return false;
    }
  }
}