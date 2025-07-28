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
 */
export class MessageMiddlewareManager {
  private middlewares: MessageMiddleware[] = [];
  private logger: Logger;
  private telemetry: TelemetryService;

  constructor(logger: Logger, telemetry: TelemetryService) {
    this.logger = logger;
    this.telemetry = telemetry;
  }

  /**
   * Adds a middleware to the chain
   */
  public use(middleware: MessageMiddleware): void {
    if (!middleware.enabled) {
      this.logger.debug(`Message middleware ${middleware.name} is disabled, skipping registration`);
      return;
    }

    this.middlewares.push(middleware);
    this.logger.debug(`Registered message middleware: ${middleware.name}`);
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
   * Removes a middleware from the chain by name
   */
  public remove(name: string): boolean {
    const index = this.middlewares.findIndex(m => m.name === name);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      this.logger.debug(`Removed message middleware: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Initializes all registered middlewares
   */
  public async initialize(): Promise<void> {
    for (const middleware of this.middlewares) {
      if (middleware.initialize) {
        try {
          await middleware.initialize(this.logger, this.telemetry);
          this.logger.debug(`Initialized message middleware: ${middleware.name}`);
        } catch (error) {
          this.logger.error(`Failed to initialize message middleware ${middleware.name}:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Executes the middleware chain on a message
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

    let currentIndex = 0;
    let error: Error | undefined;

    const next = async (): Promise<void> => {
      if (currentIndex >= this.middlewares.length) {
        return; // End of chain
      }

      const middleware = this.middlewares[currentIndex++];
      
      try {
        this.logger.debug(`Executing message middleware: ${middleware.name}`);
        
        // Record middleware execution start
        const middlewareStartTime = Date.now();
        
        await middleware.execute(context, next);
        
        // Record middleware execution time
        const middlewareExecutionTime = Date.now() - middlewareStartTime;
        this.telemetry.recordMiddlewareExecution?.(middleware.name, middlewareExecutionTime);
        
        this.logger.debug(`Message middleware ${middleware.name} completed in ${middlewareExecutionTime}ms`);
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(`Message middleware ${middleware.name} failed:`, error);
        this.telemetry.recordError?.('message_middleware_execution_failed', 'middleware');
        throw error;
      }
    };

    try {
      await next();
      
      const executionTime = Date.now() - startTime;
      this.logger.debug(`Message middleware chain completed in ${executionTime}ms`);
      
      return {
        success: true,
        message: context.message,
        skip: context.skip,
        skipReason: context.skipReason,
        executionTime,
        middlewareCount: this.middlewares.length
      };
    } catch (err) {
      const executionTime = Date.now() - startTime;
      error = err instanceof Error ? err : new Error(String(err));
      
      this.logger.error(`Message middleware chain failed after ${executionTime}ms:`, error);
      
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
   * Gets the list of registered middleware names
   */
  public getMiddlewareNames(): string[] {
    return this.middlewares.map(m => m.name);
  }

  /**
   * Gets the number of registered middlewares
   */
  public getMiddlewareCount(): number {
    return this.middlewares.length;
  }

  /**
   * Checks if a middleware is registered
   */
  public hasMiddleware(name: string): boolean {
    return this.middlewares.some(m => m.name === name);
  }

  /**
   * Clears all registered middlewares
   */
  public clear(): void {
    this.middlewares = [];
    this.logger.debug('Cleared all message middlewares');
  }

  /**
   * Cleanup all middlewares
   */
  public async cleanup(): Promise<void> {
    for (const middleware of this.middlewares) {
      if (middleware.cleanup) {
        try {
          await middleware.cleanup();
          this.logger.debug(`Cleaned up message middleware: ${middleware.name}`);
        } catch (error) {
          this.logger.error(`Failed to cleanup message middleware ${middleware.name}:`, error);
        }
      }
    }
  }
}