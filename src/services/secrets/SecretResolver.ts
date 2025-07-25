import { Logger } from '../../utils/logger';
import { SecretProvider, SecretResolverConfig } from './types';
import { SecretProviderManager } from './SecretProviderManager';
import { SecretCache } from './SecretCache';
import { SecretValidator } from './SecretValidator';

/**
 * Main secret resolver that coordinates multiple secret providers
 */
export class SecretResolver {
  private providerManager: SecretProviderManager;
  private cache: SecretCache;
  private validator: SecretValidator;
  private logger: Logger;

  constructor(logger: Logger, config?: SecretResolverConfig) {
    this.logger = logger;
    this.providerManager = new SecretProviderManager(logger);
    this.cache = new SecretCache(
      logger,
      config?.cacheEnabled ?? true,
      config?.cacheTtlSeconds ?? 300
    );
    this.validator = new SecretValidator(logger);
  }

  /**
   * Register a new secret provider
   */
  public registerProvider(provider: SecretProvider): void {
    this.providerManager.registerProvider(provider);
  }

  /**
   * Resolve a secret from an external source
   */
  public async resolveSecret(source: string): Promise<string> {
    // Validate the source format
    const validation = this.validator.validateSource(source);
    if (!validation.valid) {
      throw new Error(`Invalid secret source: ${validation.error}`);
    }

    // Check cache first
    const cachedValue = this.cache.get(source);
    if (cachedValue) {
      return cachedValue;
    }

    // Find a provider that can handle this source
    const provider = this.providerManager.findProvider(source);
    if (!provider) {
      throw new Error(`No secret provider found for source: ${source}`);
    }

    try {
      this.logger.debug(`Resolving secret using ${provider.name} provider`);
      const secret = await provider.resolve(source);
      
      // Validate the resolved value
      const valueValidation = this.validator.validateResolvedValue(secret, source);
      if (!valueValidation.valid) {
        throw new Error(valueValidation.error);
      }

      // Cache the resolved secret
      this.cache.set(source, secret);
      
      this.logger.debug(`Successfully resolved secret using ${provider.name} provider`);
      return secret;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to resolve secret using ${provider.name} provider: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Resolve a credential field, supporting both direct values and external sources
   */
  public async resolveCredentialField(
    directValue: string | undefined,
    sourceValue: string | undefined,
    fieldName: string,
    accountName: string
  ): Promise<string | undefined> {
    // Validate the field configuration
    const validation = this.validator.validateCredentialField(
      directValue,
      sourceValue,
      fieldName,
      accountName
    );
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // If direct value is provided, check if it's an environment variable reference
    if (directValue) {
      if (directValue.startsWith('${') && directValue.endsWith('}')) {
        return await this.resolveSecret(directValue);
      }
      return directValue;
    }

    // If source value is provided, resolve it
    if (sourceValue) {
      return await this.resolveSecret(sourceValue);
    }

    // Neither provided
    return undefined;
  }

  /**
   * Get list of available providers
   */
  public getAvailableProviders(): string[] {
    return this.providerManager.getAvailableProviders();
  }

  /**
   * Check if a specific provider is available
   */
  public isProviderAvailable(providerName: string): boolean {
    return this.providerManager.isProviderAvailable(providerName);
  }

  /**
   * Clear the secret cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; enabled: boolean; defaultTtlSeconds: number } {
    return this.cache.getStats();
  }

  /**
   * Enable or disable caching
   */
  public setCacheEnabled(enabled: boolean): void {
    this.cache.setEnabled(enabled);
  }

  /**
   * Update cache TTL
   */
  public setCacheTtl(ttlSeconds: number): void {
    this.cache.setDefaultTtl(ttlSeconds);
  }

  /**
   * Clean up expired cache entries
   */
  public cleanupCache(): void {
    this.cache.cleanup();
  }

  /**
   * Remove a specific secret from cache
   */
  public removeCachedSecret(source: string): boolean {
    return this.cache.delete(source);
  }

  /**
   * Get all registered providers
   */
  public getProviders(): SecretProvider[] {
    return this.providerManager.getProviders();
  }

  /**
   * Remove a provider by name
   */
  public removeProvider(providerName: string): boolean {
    return this.providerManager.removeProvider(providerName);
  }
}