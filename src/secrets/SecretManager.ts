import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';
import { BaseService } from '../services/baseService';
import { 
  SecretProvider, 
  SecretResult, 
  SecretMetadata, 
  SecretManagerConfig,
  SecretCacheConfig
} from './types';
import { SecretCache, CacheStats } from './SecretCache';
import { RotationDetector, RotationStats } from './RotationDetector';
import { FileSecretProvider } from './providers/FileSecretProvider';
import { VaultSecretProvider } from './providers/VaultSecretProvider';
import { AwsSecretProvider } from './providers/AwsSecretProvider';

/**
 * Unified secret management system that consolidates all secret operations
 * 
 * Features:
 * - Multiple secret providers (file, Vault, AWS Secrets Manager)
 * - Intelligent caching with TTL
 * - Secret rotation detection
 * - Retry logic and error handling
 * - Telemetry and monitoring
 * - Type-safe configuration
 */
export class SecretManager extends BaseService {
  private config: SecretManagerConfig;
  private providers = new Map<string, SecretProvider>();
  private cache: SecretCache;
  private rotationDetector?: RotationDetector;
  private initialized = false;

  constructor(config: SecretManagerConfig, logger: Logger, telemetry?: TelemetryService) {
    super(logger, telemetry as TelemetryService);
    
    this.config = {
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes default
        maxSize: 1000,
        encryptCache: false
      },
      rotation: {
        enabled: false,
        checkInterval: '*/5 * * * *', // Every 5 minutes
        retryOnFailure: true,
        retryDelay: 30, // 30 seconds
        maxRetries: 3,
        notifyOnRotation: true,
        testConnectionOnRotation: false
      },
      defaultTimeout: 30000, // 30 seconds
      enableTelemetry: true,
      ...config
    };

    // Initialize cache
    this.cache = new SecretCache(this.config.cache as SecretCacheConfig, this.logger);
  }

  /**
   * Initialize the secret manager and all providers
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('SecretManager is already initialized');
      return;
    }

    const span = this.telemetry?.startSpan('secret_manager.initialize');

    try {
      this.logger.info('Initializing SecretManager...');

      // Register built-in providers
      await this.registerBuiltInProviders();

      // Initialize rotation detector if enabled
      if (this.config.rotation?.enabled) {
        this.rotationDetector = new RotationDetector(
          this.config.rotation,
          this,
          this.logger,
          this.telemetry
        );
      }

      this.initialized = true;
      
      const providerCount = this.providers.size;
      this.logger.info(`SecretManager initialized with ${providerCount} providers`);
      
      span?.setAttributes({
        'secret_manager.providers_count': providerCount,
        'secret_manager.cache_enabled': this.config.cache?.enabled || false,
        'secret_manager.rotation_enabled': this.config.rotation?.enabled || false,
      });
      span?.setStatus({ code: 1 }); // OK

    } catch (error) {
      this.logger.error('Failed to initialize SecretManager:', error);
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Start the secret manager (including rotation detection)
   */
  public async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('SecretManager must be initialized before starting');
    }

    if (this.rotationDetector) {
      this.rotationDetector.start();
    }

    this.logger.info('SecretManager started');
  }

  /**
   * Stop the secret manager
   */
  public async stop(): Promise<void> {
    if (this.rotationDetector) {
      this.rotationDetector.stop();
    }

    // Cleanup all providers
    for (const provider of this.providers.values()) {
      try {
        await provider.cleanup();
      } catch (error) {
        this.logger.warn(`Error cleaning up provider ${provider.name}:`, error);
      }
    }

    this.logger.info('SecretManager stopped');
  }

  /**
   * Resolve a secret from any supported source
   */
  public async resolve(source: string): Promise<SecretResult> {
    if (!this.initialized) {
      throw new Error('SecretManager is not initialized');
    }

    const span = this.telemetry?.startSpan('secret_manager.resolve', {
      'secret.source': this.maskSource(source),
    });

    try {
      // Check cache first
      const cached = this.cache.get(source);
      if (cached) {
        span?.setAttributes({
          'secret.cache_hit': true,
          'secret.provider': cached.metadata.provider,
        });
        span?.setStatus({ code: 1 }); // OK
        return cached;
      }

      // Find appropriate provider
      const provider = this.findProvider(source);
      if (!provider) {
        throw new Error(`No provider found for secret source: ${this.maskSource(source)}`);
      }

      this.logger.debug(`Resolving secret using provider: ${provider.name}`);

      // Resolve the secret
      const startTime = Date.now();
      const value = await provider.resolve(source);
      const duration = Date.now() - startTime;

      // Create result with metadata
      const metadata: SecretMetadata = {
        source,
        provider: provider.name,
        lastAccessed: new Date(),
        accessCount: 1,
      };

      const result: SecretResult = {
        value,
        metadata,
        cached: false
      };

      // Cache the result
      this.cache.set(source, result);

      // Track for rotation detection if enabled
      if (this.rotationDetector) {
        this.rotationDetector.trackSecret(source);
      }

      span?.setAttributes({
        'secret.cache_hit': false,
        'secret.provider': provider.name,
        'secret.duration_ms': duration,
        'secret.value_length': value.length,
      });
      span?.setStatus({ code: 1 }); // OK

      this.logger.debug(`Successfully resolved secret from ${provider.name} in ${duration}ms`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to resolve secret: ${errorMessage}`);
      
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR
      
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Test connectivity to all providers
   */
  public async testConnections(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, provider] of this.providers.entries()) {
      try {
        const connected = await provider.testConnection();
        results.set(name, connected);
        this.logger.debug(`Provider ${name} connection test: ${connected ? 'PASS' : 'FAIL'}`);
      } catch (error) {
        results.set(name, false);
        this.logger.warn(`Provider ${name} connection test failed:`, error);
      }
    }

    return results;
  }

  /**
   * Clear cache for a specific source or all sources
   */
  public clearCache(source?: string): void {
    if (source) {
      this.cache.delete(source);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Get rotation detection statistics
   */
  public getRotationStats(): RotationStats | null {
    return this.rotationDetector?.getStats() || null;
  }

  /**
   * Get list of available providers
   */
  public getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get manager configuration
   */
  public getConfig(): SecretManagerConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  public updateCacheConfig(config: Partial<typeof this.config.cache>): void {
    if (this.config.cache) {
      this.config.cache = { ...this.config.cache, ...config };
      this.cache.updateConfig(this.config.cache);
    }
  }

  /**
   * Register a custom secret provider
   */
  public async registerProvider(provider: SecretProvider): Promise<void> {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider with name '${provider.name}' is already registered`);
    }

    // Initialize the provider
    const providerConfig = this.config.providers?.[provider.name] || {};
    await provider.initialize(providerConfig, this.logger, this.telemetry);

    this.providers.set(provider.name, provider);
    this.logger.debug(`Registered secret provider: ${provider.name}`);
  }

  /**
   * Unregister a secret provider
   */
  public async unregisterProvider(name: string): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) {
      return false;
    }

    try {
      await provider.cleanup();
    } catch (error) {
      this.logger.warn(`Error cleaning up provider ${name}:`, error);
    }

    this.providers.delete(name);
    this.logger.debug(`Unregistered secret provider: ${name}`);
    return true;
  }

  /**
   * Register built-in providers
   */
  private async registerBuiltInProviders(): Promise<void> {
    const providers = [
      new FileSecretProvider(),
      new VaultSecretProvider(),
      new AwsSecretProvider()
    ];

    for (const provider of providers) {
      try {
        await this.registerProvider(provider);
      } catch (error) {
        this.logger.warn(`Failed to register provider ${provider.name}:`, error);
        // Continue with other providers
      }
    }
  }

  /**
   * Find the appropriate provider for a source
   */
  private findProvider(source: string): SecretProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.canHandle(source)) {
        return provider;
      }
    }
    return null;
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