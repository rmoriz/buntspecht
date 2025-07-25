import { IncomingMessage } from 'http';
import { Logger } from '../../utils/logger';

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Handles rate limiting for webhook requests
 * Note: This is a basic in-memory rate limiter. For production use with multiple instances,
 * consider using Redis or another distributed storage solution.
 */
export class WebhookRateLimiter {
  private config: RateLimitConfig;
  private logger: Logger;
  private requestCounts: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    if (this.config.enabled) {
      // Clean up expired entries every minute
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 60000);
    }
  }

  /**
   * Checks if a request should be rate limited
   * @param req The incoming request
   * @returns true if the request should be allowed, false if rate limited
   */
  public checkRateLimit(req: IncomingMessage): boolean {
    if (!this.config.enabled) {
      return true; // Rate limiting disabled
    }

    const clientKey = this.getClientKey(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.requestCounts.get(clientKey);
    
    if (!entry || entry.resetTime <= now) {
      // Create new entry or reset expired entry
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs
      };
      this.requestCounts.set(clientKey, entry);
      return true;
    }

    if (entry.count >= this.config.maxRequests) {
      this.logger.warn(`Rate limit exceeded for client: ${clientKey} (${entry.count}/${this.config.maxRequests} requests)`);
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Records the result of a request (for conditional rate limiting)
   * @param req The request
   * @param success Whether the request was successful
   */
  public recordRequest(req: IncomingMessage, success: boolean): void {
    if (!this.config.enabled) {
      return;
    }

    // If we should skip successful or failed requests, adjust the count
    if ((success && this.config.skipSuccessfulRequests) || 
        (!success && this.config.skipFailedRequests)) {
      const clientKey = this.getClientKey(req);
      const entry = this.requestCounts.get(clientKey);
      if (entry && entry.count > 0) {
        entry.count--;
      }
    }
  }

  /**
   * Gets the remaining requests for a client
   * @param req The request
   * @returns Object with remaining requests and reset time
   */
  public getRateLimitInfo(req: IncomingMessage): { remaining: number; resetTime: number } {
    if (!this.config.enabled) {
      return { remaining: this.config.maxRequests, resetTime: 0 };
    }

    const clientKey = this.getClientKey(req);
    const entry = this.requestCounts.get(clientKey);
    const now = Date.now();

    if (!entry || entry.resetTime <= now) {
      return { remaining: this.config.maxRequests - 1, resetTime: now + this.config.windowMs };
    }

    return { 
      remaining: Math.max(0, this.config.maxRequests - entry.count), 
      resetTime: entry.resetTime 
    };
  }

  /**
   * Gets a unique key for the client (IP address)
   */
  private getClientKey(req: IncomingMessage): string {
    // Use the same IP detection logic as the validator
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const remoteAddress = req.socket.remoteAddress || 'unknown';
    
    // Normalize IPv6-mapped IPv4 addresses to IPv4
    if (remoteAddress.startsWith('::ffff:')) {
      return remoteAddress.substring(7);
    }
    
    return remoteAddress;
  }

  /**
   * Cleans up expired rate limit entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.requestCounts.entries()) {
      if (entry.resetTime <= now) {
        this.requestCounts.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired rate limit entries`);
    }
  }

  /**
   * Clears all rate limit data (useful for testing)
   */
  public clear(): void {
    this.requestCounts.clear();
  }

  /**
   * Stops the cleanup interval
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}