import { setInterval, clearInterval } from 'timers';
import { Logger } from '../utils/logger';
import { SecretResult, SecretCacheConfig } from './types';

/**
 * In-memory cache for secrets with TTL support
 */
export class SecretCache {
  private cache = new Map<string, CacheEntry>();
  private logger: Logger;
  private config: SecretCacheConfig;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(config: SecretCacheConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    if (this.config.enabled) {
      this.logger.debug(`Secret cache initialized with TTL: ${config.ttl}ms, max size: ${config.maxSize}`);
      
      // Start cleanup interval
      this.startCleanupInterval();
    }
  }

  /**
   * Get a cached secret
   */
  public get(source: string): SecretResult | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.cache.get(source);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(source);
      this.logger.debug(`Removed expired secret from cache: ${this.maskSource(source)}`);
      return null;
    }

    // Update access metadata
    entry.result.metadata.lastAccessed = new Date();
    entry.result.metadata.accessCount++;

    this.logger.debug(`Cache hit for secret: ${this.maskSource(source)}`);
    return {
      ...entry.result,
      cached: true
    };
  }

  /**
   * Store a secret in cache
   */
  public set(source: string, result: SecretResult): void {
    if (!this.config.enabled) {
      return;
    }

    // Check cache size limit
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    const expiresAt = Date.now() + this.config.ttl;
    const entry: CacheEntry = {
      result: {
        ...result,
        cached: true
      },
      expiresAt,
      createdAt: Date.now()
    };

    this.cache.set(source, entry);
    this.logger.debug(`Cached secret: ${this.maskSource(source)} (expires in ${this.config.ttl}ms)`);
  }

  /**
   * Remove a secret from cache
   */
  public delete(source: string): boolean {
    const deleted = this.cache.delete(source);
    if (deleted) {
      this.logger.debug(`Removed secret from cache: ${this.maskSource(source)}`);
    }
    return deleted;
  }

  /**
   * Clear all cached secrets
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.debug(`Cleared ${size} secrets from cache`);
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    const now = Date.now();
    let expired = 0;
    let totalAccessCount = 0;

    for (const [_source, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expired++;
      }
      totalAccessCount += entry.result.metadata.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      expired,
      totalAccessCount,
      enabled: this.config.enabled
    };
  }

  /**
   * Get all cached sources (for debugging)
   */
  public getSources(): string[] {
    return Array.from(this.cache.keys()).map(source => this.maskSource(source));
  }

  /**
   * Check if a secret exists in cache (without accessing it)
   */
  public has(source: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(source);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(source);
      return false;
    }

    return true;
  }

  /**
   * Update cache configuration
   */
  public updateConfig(config: Partial<SecretCacheConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.debug(`Updated cache configuration: ${JSON.stringify(config)}`);
  }

  /**
   * Evict the oldest entry from cache
   */
  private evictOldest(): void {
    let oldestSource: string | null = null;
    let oldestTime = Infinity;

    for (const [source, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestSource = source;
      }
    }

    if (oldestSource) {
      this.cache.delete(oldestSource);
      this.logger.debug(`Evicted oldest secret from cache: ${this.maskSource(oldestSource)}`);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    const cleanupInterval = Math.min(this.config.ttl / 4, 60000); // Every quarter TTL or 1 minute, whichever is smaller
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, cleanupInterval);
    
    // Allow Node.js to exit even if timer is active
    if (this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup interval timer
   */
  public stopCleanupInterval(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;

    for (const [source, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(source);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug(`Cleaned up ${removed} expired secrets from cache`);
    }
  }

  /**
   * Mask sensitive parts of the source for logging
   */
  private maskSource(source: string): string {
    try {
      const url = new URL(source);
      return `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch {
      // Not a URL, mask the middle part
      if (source.length > 10) {
        return source.substring(0, 5) + '***' + source.substring(source.length - 5);
      }
      return '***';
    }
  }
}

/**
 * Internal cache entry structure
 */
interface CacheEntry {
  result: SecretResult;
  expiresAt: number;
  createdAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  expired: number;
  totalAccessCount: number;
  enabled: boolean;
}