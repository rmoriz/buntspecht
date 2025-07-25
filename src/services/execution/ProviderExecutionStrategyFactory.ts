import { MessageProvider } from '../../messages/messageProvider';
import { ProviderExecutionStrategy, ExecutionContext } from './ProviderExecutionStrategy';
import { StandardProviderStrategy } from './StandardProviderStrategy';
import { AttachmentProviderStrategy } from './AttachmentProviderStrategy';
import { MultiJsonProviderStrategy } from './MultiJsonProviderStrategy';

/**
 * Factory for creating appropriate provider execution strategies
 */
export class ProviderExecutionStrategyFactory {
  private strategies: ProviderExecutionStrategy[];

  constructor(context: ExecutionContext) {
    this.strategies = [
      new MultiJsonProviderStrategy(context),
      new AttachmentProviderStrategy(context),
      new StandardProviderStrategy(context), // Keep this last as fallback
    ];
  }

  /**
   * Get the appropriate strategy for the given provider
   */
  public getStrategy(provider: MessageProvider): ProviderExecutionStrategy {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(provider)) {
        return strategy;
      }
    }

    // This should never happen since StandardProviderStrategy handles everything else
    throw new Error(`No strategy found for provider: ${provider.getProviderName()}`);
  }

  /**
   * Get all available strategies
   */
  public getAllStrategies(): ProviderExecutionStrategy[] {
    return [...this.strategies];
  }

  /**
   * Get strategy by name
   */
  public getStrategyByName(name: string): ProviderExecutionStrategy | undefined {
    return this.strategies.find(strategy => strategy.getStrategyName() === name);
  }
}