import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';
import { SecretProvider, SecretProviderConfig } from '../types';

/**
 * Abstract base class for secret providers with common functionality
 */
export abstract class BaseSecretProvider implements SecretProvider {
  protected logger?: Logger;
  protected telemetry?: TelemetryService;
  protected config: SecretProviderConfig = {};
  protected initialized = false;

  public abstract readonly name: string;

  /**
   * Initialize the provider with configuration
   */
  public async initialize(config: SecretProviderConfig, logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.config = {
      enabled: true,
      timeout: 30000, // 30 seconds default
      retryAttempts: 3,
      retryDelay: 1000, // 1 second default
      ...config
    };
    this.logger = logger;
    this.telemetry = telemetry;
    
    if (this.config.enabled === false) {
      this.logger.debug(`Secret provider ${this.name} is disabled`);
      return;
    }

    await this.initializeProvider();
    this.initialized = true;
    this.logger.debug(`Secret provider ${this.name} initialized successfully`);
  }

  /**
   * Provider-specific initialization logic
   */
  protected abstract initializeProvider(): Promise<void>;

  /**
   * Check if this provider can handle the given source
   */
  public abstract canHandle(source: string): boolean;

  /**
   * Resolve a secret from the given source with retry logic
   */
  public async resolve(source: string): Promise<string> {
    if (!this.initialized) {
      throw new Error(`Secret provider ${this.name} is not initialized`);
    }

    if (!this.canHandle(source)) {
      throw new Error(`Secret provider ${this.name} cannot handle source: ${source}`);
    }

    const span = this.telemetry?.startSpan(`secret.resolve.${this.name}`, {
      'secret.provider': this.name,
      'secret.source': this.maskSource(source),
    });

    let lastError: Error | undefined;
    const maxAttempts = this.config.retryAttempts || 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger?.debug(`Resolving secret from ${this.name} (attempt ${attempt}/${maxAttempts}): ${this.maskSource(source)}`);
        
        const startTime = Date.now();
        const value = await this.resolveSecret(source);
        const duration = Date.now() - startTime;

        span?.setAttributes({
          'secret.success': true,
          'secret.attempt': attempt,
          'secret.duration_ms': duration,
          'secret.value_length': value.length,
        });
        span?.setStatus({ code: 1 }); // OK

        this.logger?.debug(`Successfully resolved secret from ${this.name} in ${duration}ms`);
        return value;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const duration = Date.now();

        this.logger?.warn(`Failed to resolve secret from ${this.name} (attempt ${attempt}/${maxAttempts}): ${lastError.message}`);

        span?.setAttributes({
          'secret.success': false,
          'secret.attempt': attempt,
          'secret.error': lastError.message,
        });

        if (attempt < maxAttempts) {
          const delay = this.config.retryDelay || 1000;
          this.logger?.debug(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    span?.recordException(lastError!);
    span?.setStatus({ code: 2, message: lastError!.message }); // ERROR
    span?.end();

    throw new Error(`Failed to resolve secret from ${this.name} after ${maxAttempts} attempts: ${lastError!.message}`);
  }

  /**
   * Provider-specific secret resolution logic
   */
  protected abstract resolveSecret(source: string): Promise<string>;

  /**
   * Test connectivity to the secret provider
   */
  public abstract testConnection(): Promise<boolean>;

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    this.logger?.debug(`Cleaning up secret provider ${this.name}`);
    await this.cleanupProvider();
    this.initialized = false;
  }

  /**
   * Provider-specific cleanup logic
   */
  protected abstract cleanupProvider(): Promise<void>;

  /**
   * Mask sensitive parts of the source for logging
   */
  protected maskSource(source: string): string {
    // Default implementation - providers can override for specific masking
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

  /**
   * Create a delay for retry logic
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate that required dependencies are available
   */
  protected validateDependencies(dependencies: Record<string, any>): void {
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (!dependency) {
        throw new Error(`Required dependency '${name}' is not available for ${this.name} provider. Please install the required package.`);
      }
    }
  }

  /**
   * Execute with timeout
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    const timeout = timeoutMs || this.config.timeout || 30000;
    
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
      )
    ]);
  }
}