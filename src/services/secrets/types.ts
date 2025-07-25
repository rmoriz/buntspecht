/**
 * Interface for secret providers that can resolve external secret sources
 */
export interface SecretProvider {
  name: string;
  canHandle(source: string): boolean;
  resolve(source: string): Promise<string>;
}

/**
 * Configuration for secret resolution
 */
export interface SecretResolverConfig {
  enabledProviders?: string[];
  cacheEnabled?: boolean;
  cacheTtlSeconds?: number;
}

/**
 * Cached secret entry
 */
export interface CachedSecret {
  value: string;
  timestamp: number;
  ttl: number;
}