import { MessageProvider } from '../../messages/messageProvider';
import { ProviderConfig } from '../../types/config';
import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../telemetryInterface';
import { SocialMediaClient } from '../socialMediaClient';
import { MessageMiddlewareManager } from '../middleware';

/**
 * Context object containing all dependencies needed for provider execution
 */
export interface ExecutionContext {
  logger: Logger;
  telemetry: TelemetryService;
  socialMediaClient: SocialMediaClient;
  getProviderConfigs: () => ProviderConfig[];
  middlewareManager?: MessageMiddlewareManager;
}

/**
 * Result of provider execution
 */
export interface ExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  duration: number;
}

/**
 * Abstract base class for provider execution strategies
 */
export abstract class ProviderExecutionStrategy {
  protected context: ExecutionContext;

  constructor(context: ExecutionContext) {
    this.context = context;
  }

  /**
   * Execute the provider with the given configuration
   */
  public abstract execute(
    providerName: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig
  ): Promise<ExecutionResult>;

  /**
   * Check if this strategy can handle the given provider
   */
  public abstract canHandle(provider: MessageProvider): boolean;

  /**
   * Get the strategy name for logging and telemetry
   */
  public abstract getStrategyName(): string;

  /**
   * Common method to record execution metrics
   */
  protected recordExecution(providerName: string, duration: number): void {
    this.context.telemetry.recordProviderExecution(providerName, duration / 1000);
  }

  /**
   * Common method to record errors
   */
  protected recordError(providerName: string, error: Error): void {
    this.context.logger.error(`Failed to execute task for provider "${providerName}":`, error);
    this.context.telemetry.recordError('provider_execution_failed', providerName);
  }

  /**
   * Common method to validate provider configuration
   */
  protected validateProviderConfig(providerName: string, providerConfig: ProviderConfig | undefined): ProviderConfig {
    if (!providerConfig) {
      throw new Error(`Provider configuration not found for: ${providerName}`);
    }
    return providerConfig;
  }

  /**
   * Common method to check if message is empty
   */
  protected isEmptyMessage(message: string): boolean {
    return !message || message.trim() === '';
  }
}