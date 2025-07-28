import { Logger } from '../../utils/logger';
import { TelemetryService } from '../telemetryInterface';
import { MessageWithAttachments } from '../../messages/messageProvider';
import { ProviderConfig } from '../../types/config';
import { 
  MessageMiddlewareContext, 
  MessageMiddlewareFunction, 
  MessageMiddleware, 
  MessageMiddlewareResult,
  MessageMiddlewareConfig
} from './types';

/**
 * Manages the middleware chain for message processing
 * Supports both global and provider-specific middleware chains
 */
export class MessageMiddlewareManager {
  private globalMiddlewares: MessageMiddleware[] = [];
  private providerMiddlewares: Map<string, MessageMiddleware[]> = new Map();
  private logger: Logger;
  private telemetry: TelemetryService;

  constructor(logger: Logger, telemetry: TelemetryService) {
    this.logger = logger;
    this.telemetry = telemetry;
  }

  /**
   * Adds a middleware to the global chain
   */
  public use(middleware: MessageMiddleware): void {
    if (!middleware.enabled) {
      this.logger.debug(`Message middleware ${middleware.name} is disabled, skipping registration`);
      return;
    }

    this.globalMiddlewares.push(middleware);
    this.logger.debug(`Registered global message middleware: ${middleware.name}`);
  }

  /**
   * Adds a middleware to a specific provider's chain
   */
  public useForProvider(providerName: string, middleware: MessageMiddleware): void {
    if (!middleware.enabled) {
      this.logger.debug(`Message middleware ${middleware.name} is disabled for provider ${providerName}, skipping registration`);
      return;
    }

    if (!this.providerMiddlewares.has(providerName)) {
      this.providerMiddlewares.set(providerName, []);
    }

    this.providerMiddlewares.get(providerName)!.push(middleware);
    this.logger.debug(`Registered provider-specific message middleware: ${middleware.name} for provider: ${providerName}`);
  }

  /**
   * Adds a middleware function to the chain
   */
  public useFunction(name: string, middlewareFunction: MessageMiddlewareFunction, enabled: boolean = true): void {
    if (!enabled) {
      this.logger.debug(`Message middleware function ${name} is disabled, skipping registration`);
      return;
    }

    const middleware: MessageMiddleware = {
      name,
      enabled,
      execute: middlewareFunction
    };

    this.use(middleware);
  }

  /**
   * Removes a middleware from the global chain by name
   */
  public remove(name: string): boolean {
    const index = this.globalMiddlewares.findIndex(m => m.name === name);
    if (index !== -1) {
      this.globalMiddlewares.splice(index, 1);
      this.logger.debug(`Removed global message middleware: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Removes a middleware from a specific provider's chain by name
   */
  public removeFromProvider(providerName: string, name: string): boolean {
    const middlewares = this.providerMiddlewares.get(providerName);
    if (!middlewares) {
      return false;
    }

    const index = middlewares.findIndex(m => m.name === name);
    if (index !== -1) {
      middlewares.splice(index, 1);
      this.logger.debug(`Removed provider-specific message middleware: ${name} from provider: ${providerName}`);
      
      // Clean up empty provider middleware arrays
      if (middlewares.length === 0) {
        this.providerMiddlewares.delete(providerName);
      }
      
      return true;
    }
    return false;
  }

  /**
   * Initializes all registered middlewares (global and provider-specific)
   */
  public async initialize(): Promise<void> {
    // Initialize global middlewares
    for (const middleware of this.globalMiddlewares) {
      if (middleware.initialize) {
        try {
          await middleware.initialize(this.logger, this.telemetry);
          this.logger.debug(`Initialized global message middleware: ${middleware.name}`);
        } catch (error) {
          this.logger.error(`Failed to initialize global message middleware ${middleware.name}:`, error);
          throw error;
        }
      }
    }

    // Initialize provider-specific middlewares
    for (const [providerName, middlewares] of this.providerMiddlewares.entries()) {
      for (const middleware of middlewares) {
        if (middleware.initialize) {
          try {
            await middleware.initialize(this.logger, this.telemetry);
            this.logger.debug(`Initialized provider-specific message middleware: ${middleware.name} for provider: ${providerName}`);
          } catch (error) {
            this.logger.error(`Failed to initialize provider-specific message middleware ${middleware.name} for provider ${providerName}:`, error);
            throw error;
          }
        }
      }
    }
  }

  /**
   * Executes the middleware chain on a message (global + provider-specific)
   */
  public async execute(
    message: MessageWithAttachments,
    providerName: string,
    providerConfig: ProviderConfig,
    accountNames: string[],
    visibility: 'public' | 'unlisted' | 'private' | 'direct'
  ): Promise<MessageMiddlewareResult> {
    const startTime = Date.now();
    
    const context: MessageMiddlewareContext = {
      message: { ...message }, // Clone the message to avoid mutations
      providerName,
      providerConfig,
      accountNames: [...accountNames], // Clone array
      visibility,
      data: {},
      logger: this.logger,
      telemetry: this.telemetry,
      startTime,
      skip: false
    };

    // Combine global and provider-specific middlewares
    const providerSpecificMiddlewares = this.providerMiddlewares.get(providerName) || [];
    const allMiddlewares = [...this.globalMiddlewares, ...providerSpecificMiddlewares];

    let currentIndex = 0;
    let error: Error | undefined;

    const next = async (): Promise<void> => {
      if (currentIndex >= allMiddlewares.length) {
        return; // End of chain
      }

      const middleware = allMiddlewares[currentIndex++];
      const isProviderSpecific = providerSpecificMiddlewares.includes(middleware);
      
      try {
        const middlewareType = isProviderSpecific ? 'provider-specific' : 'global';
        this.logger.debug(`Executing ${middlewareType} message middleware: ${middleware.name} for provider: ${providerName}`);
        
        // Record middleware execution start
        const middlewareStartTime = Date.now();
        
        await middleware.execute(context, next);
        
        // Record middleware execution time
        const middlewareExecutionTime = Date.now() - middlewareStartTime;
        this.telemetry.recordProviderExecution?.(middleware.name, middlewareExecutionTime);
        
        this.logger.debug(`${middlewareType} message middleware ${middleware.name} completed in ${middlewareExecutionTime}ms`);
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(`Message middleware ${middleware.name} failed for provider ${providerName}:`, error);
        this.telemetry.recordError?.('message_middleware_execution_failed', 'middleware');
        throw error;
      }
    };

    try {
      await next();
      
      const executionTime = Date.now() - startTime;
      this.logger.debug(`Message middleware chain completed for provider ${providerName} in ${executionTime}ms`);
      
      return {
        success: true,
        message: context.message,
        skip: context.skip,
        skipReason: context.skipReason,
        executionTime,
        middlewareCount: allMiddlewares.length
      };
    } catch (err) {
      const executionTime = Date.now() - startTime;
      error = err instanceof Error ? err : new Error(String(err));
      
      this.logger.error(`Message middleware chain failed for provider ${providerName} after ${executionTime}ms:`, error);
      
      return {
        success: false,
        message: context.message,
        skip: context.skip,
        skipReason: context.skipReason,
        error,
        executionTime,
        middlewareCount: currentIndex
      };
    }
  }

  /**
   * Gets the list of registered global middleware names
   */
  public getMiddlewareNames(): string[] {
    return this.globalMiddlewares.map(m => m.name);
  }

  /**
   * Gets the list of registered middleware names for a specific provider
   */
  public getProviderMiddlewareNames(providerName: string): string[] {
    const middlewares = this.providerMiddlewares.get(providerName) || [];
    return middlewares.map(m => m.name);
  }

  /**
   * Gets the total number of registered middlewares (global + all provider-specific)
   */
  public getMiddlewareCount(): number {
    let total = this.globalMiddlewares.length;
    for (const middlewares of this.providerMiddlewares.values()) {
      total += middlewares.length;
    }
    return total;
  }

  /**
   * Gets the number of global middlewares
   */
  public getGlobalMiddlewareCount(): number {
    return this.globalMiddlewares.length;
  }

  /**
   * Gets the number of provider-specific middlewares for a provider
   */
  public getProviderMiddlewareCount(providerName: string): number {
    return this.providerMiddlewares.get(providerName)?.length || 0;
  }

  /**
   * Checks if a middleware is registered globally
   */
  public hasMiddleware(name: string): boolean {
    return this.globalMiddlewares.some(m => m.name === name);
  }

  /**
   * Checks if a middleware is registered for a specific provider
   */
  public hasProviderMiddleware(providerName: string, name: string): boolean {
    const middlewares = this.providerMiddlewares.get(providerName) || [];
    return middlewares.some(m => m.name === name);
  }

  /**
   * Gets all provider names that have middleware configured
   */
  public getProvidersWithMiddleware(): string[] {
    return Array.from(this.providerMiddlewares.keys());
  }

  /**
   * Clears all registered middlewares (global and provider-specific)
   */
  public clear(): void {
    this.globalMiddlewares = [];
    this.providerMiddlewares.clear();
    this.logger.debug('Cleared all message middlewares (global and provider-specific)');
  }

  /**
   * Clears middlewares for a specific provider
   */
  public clearProvider(providerName: string): void {
    this.providerMiddlewares.delete(providerName);
    this.logger.debug(`Cleared message middlewares for provider: ${providerName}`);
  }

  /**
   * Cleanup all middlewares (global and provider-specific)
   */
  public async cleanup(): Promise<void> {
    // Cleanup global middlewares
    for (const middleware of this.globalMiddlewares) {
      if (middleware.cleanup) {
        try {
          await middleware.cleanup();
          this.logger.debug(`Cleaned up global message middleware: ${middleware.name}`);
        } catch (error) {
          this.logger.error(`Failed to cleanup global message middleware ${middleware.name}:`, error);
        }
      }
    }

    // Cleanup provider-specific middlewares
    for (const [providerName, middlewares] of this.providerMiddlewares.entries()) {
      for (const middleware of middlewares) {
        if (middleware.cleanup) {
          try {
            await middleware.cleanup();
            this.logger.debug(`Cleaned up provider-specific message middleware: ${middleware.name} for provider: ${providerName}`);
          } catch (error) {
            this.logger.error(`Failed to cleanup provider-specific message middleware ${middleware.name} for provider ${providerName}:`, error);
          }
        }
      }
    }
  }
}