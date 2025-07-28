import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface RateLimitConfig {
  /** Maximum number of messages allowed */
  maxMessages: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Rate limit scope: 'global', 'provider', or 'account' */
  scope: 'global' | 'provider' | 'account';
  /** Action when rate limit is exceeded: 'skip' or 'delay' */
  action: 'skip' | 'delay';
  /** Maximum delay time in milliseconds (for delay action) */
  maxDelayMs?: number;
  /** Custom skip reason */
  skipReason?: string;
  /** Whether to reset count on successful message */
  resetOnSuccess?: boolean;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastReset: number;
}

/**
 * Middleware for rate limiting message posting
 */
export class RateLimitMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: RateLimitConfig;
  private logger?: Logger;
  private rateLimitStore: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(name: string, config: RateLimitConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      maxDelayMs: 30000,
      resetOnSuccess: false,
      skipReason: 'Rate limit exceeded',
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized RateLimitMiddleware: ${this.name} - ${this.config.maxMessages} messages per ${this.config.windowMs}ms (${this.config.scope} scope)`);
    
    // Start cleanup interval to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.config.windowMs);
  }

  public async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const rateLimitKey = this.getRateLimitKey(context);
      const now = Date.now();
      
      // Get or create rate limit entry
      let entry = this.rateLimitStore.get(rateLimitKey);
      if (!entry || this.isWindowExpired(entry, now)) {
        entry = {
          count: 0,
          windowStart: now,
          lastReset: now
        };
        this.rateLimitStore.set(rateLimitKey, entry);
      }

      // Check if rate limit is exceeded
      if (entry.count >= this.config.maxMessages) {
        const timeUntilReset = (entry.windowStart + this.config.windowMs) - now;
        
        if (this.config.action === 'skip') {
          context.skip = true;
          context.skipReason = this.config.skipReason || `Rate limit exceeded (${entry.count}/${this.config.maxMessages} messages)`;
          
          this.logger?.info(`RateLimitMiddleware ${this.name} skipped message: ${context.skipReason}`);
          context.data[`${this.name}_rate_limited`] = true;
          context.data[`${this.name}_count`] = entry.count;
          context.data[`${this.name}_time_until_reset`] = timeUntilReset;
          
          return; // Don't call next() - stop the chain
        } else if (this.config.action === 'delay') {
          const delayMs = Math.min(timeUntilReset, this.config.maxDelayMs || 30000);
          
          this.logger?.info(`RateLimitMiddleware ${this.name} delaying message by ${delayMs}ms`);
          context.data[`${this.name}_delayed`] = true;
          context.data[`${this.name}_delay_ms`] = delayMs;
          
          await this.delay(delayMs);
          
          // Reset the window after delay
          entry.count = 0;
          entry.windowStart = Date.now();
          entry.lastReset = Date.now();
        }
      }

      // Increment count
      entry.count++;
      
      this.logger?.debug(`RateLimitMiddleware ${this.name}: ${entry.count}/${this.config.maxMessages} messages used`);
      context.data[`${this.name}_count`] = entry.count;
      context.data[`${this.name}_remaining`] = this.config.maxMessages - entry.count;

      // Continue to next middleware
      await next();

      // Reset count on success if configured
      if (this.config.resetOnSuccess) {
        entry.count = Math.max(0, entry.count - 1);
        entry.lastReset = Date.now();
      }

    } catch (error) {
      this.logger?.error(`RateLimitMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private getRateLimitKey(context: MessageMiddlewareContext): string {
    switch (this.config.scope) {
      case 'global':
        return 'global';
      case 'provider':
        return `provider:${context.providerName}`;
      case 'account':
        return `accounts:${context.accountNames.join(',')}`;
      default:
        return 'global';
    }
  }

  private isWindowExpired(entry: RateLimitEntry, now: number): boolean {
    return (now - entry.windowStart) >= this.config.windowMs;
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (this.isWindowExpired(entry, now)) {
        this.rateLimitStore.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger?.debug(`RateLimitMiddleware ${this.name} cleaned up ${cleanedCount} expired entries`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status for debugging
   */
  public getRateLimitStatus(): Record<string, RateLimitEntry> {
    const status: Record<string, RateLimitEntry> = {};
    for (const [key, entry] of this.rateLimitStore.entries()) {
      status[key] = { ...entry };
    }
    return status;
  }

  /**
   * Reset rate limit for a specific key
   */
  public resetRateLimit(key?: string): void {
    if (key) {
      this.rateLimitStore.delete(key);
      this.logger?.debug(`Reset rate limit for key: ${key}`);
    } else {
      this.rateLimitStore.clear();
      this.logger?.debug('Reset all rate limits');
    }
  }
}