import { Logger } from '../../utils/logger';
import { CachedSecret } from './types';

/**
 * Manages caching of resolved secrets to improve performance
 */
export class SecretCache {
  private cache: Map<string, CachedSecret> = new Map();
  private logger: Logger;
  private defaultTtlSeconds: number;
  private enabled: boolean;

  constructor(logger: Logger, enabled: boolean = true, defaultTtlSeconds: number = 300) {
    this.logger = logger;
    this.enabled = enabled;
    this.defaultTtlSeconds = defaultTtlSeconds;
  }

  /**
   * Get a cached secret if it exists and is not expired
   */
  public get(source: string): string | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const cached = this.cache.get(source);
    if (!cached) {
      return undefined;
    }

    // Check if the cached secret has expired
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl * 1000) {
      this.cache.delete(source);
      this.logger.debug(`Cached secret expired for source: ${this.maskSource(source)}`);
      return undefined;
    }

    this.logger.debug(`Retrieved cached secret for source: ${this.maskSource(source)}`);
    return cached.value;
  }

  /**
   * Store a secret in the cache
   */
  public set(source: string, value: string, ttlSeconds?: number): void {
    if (!this.enabled) {
      return;
    }

    const ttl = ttlSeconds || this.defaultTtlSeconds;
    const cached: CachedSecret = {
      value,
      timestamp: Date.now(),
      ttl
    };

    this.cache.set(source, cached);
    this.logger.debug(`Cached secret for source: ${this.maskSource(source)} (TTL: ${ttl}s)`);
  }

  /**
   * Remove a specific secret from the cache
   */
  public delete(source: string): boolean {
    const deleted = this.cache.delete(source);
    if (deleted) {
      this.logger.debug(`Removed cached secret for source: ${this.maskSource(source)}`);
    }
    return deleted;
  }

  /**
   * Clear all cached secrets
   */
  public clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.logger.debug(`Cleared ${count} cached secrets`);
  }

  /**
   * Get cache statistics
   */
  public getStats(): { size: number; enabled: boolean; defaultTtlSeconds: number } {
    return {
      size: this.cache.size,
      enabled: this.enabled,
      defaultTtlSeconds: this.defaultTtlSeconds
    };
  }

  /**
   * Clean up expired entries
   */
  public cleanup(): void {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    let cleanedCount = 0;

    for (const [source, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl * 1000) {
        this.cache.delete(source);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cached secrets`);
    }
  }

  /**
   * Enable or disable caching
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
    this.logger.debug(`Secret caching ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update default TTL
   */
  public setDefaultTtl(ttlSeconds: number): void {
    this.defaultTtlSeconds = ttlSeconds;
    this.logger.debug(`Updated default cache TTL to ${ttlSeconds} seconds`);
  }

  /**
   * Mask sensitive parts of the source for logging
   */
  private maskSource(source: string): string {
    // Mask sensitive information in URLs for logging
    if (source.includes('://')) {
      const [protocol, rest] = source.split('://');
      const [path, query] = rest.split('?');
      const pathParts = path.split('/');
      
      // Mask the last part of the path (usually the secret name)
      if (pathParts.length > 0) {
        pathParts[pathParts.length - 1] = '***';
      }
      
      const maskedPath = pathParts.join('/');
      return query ? `${protocol}://${maskedPath}?${query}` : `${protocol}://${maskedPath}`;
    }
    
    // For environment variables, mask the variable name
    if (source.startsWith('${') && source.endsWith('}')) {
      return '${***}';
    }
    
    return '***';
  }
}