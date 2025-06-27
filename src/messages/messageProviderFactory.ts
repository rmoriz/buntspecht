import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { PingProvider, PingProviderConfig } from './pingProvider';
import { Logger } from '../utils/logger';

/**
 * Factory for creating message providers
 */
export class MessageProviderFactory {
  /**
   * Creates a message provider based on the provider type
   * @param providerType The type of provider to create
   * @param config Configuration for the provider
   * @param logger Logger instance
   * @returns MessageProvider instance
   */
  public static async createProvider(
    providerType: string,
    config: MessageProviderConfig,
    logger: Logger
  ): Promise<MessageProvider> {
    let provider: MessageProvider;

    switch (providerType.toLowerCase()) {
      case 'ping':
        provider = new PingProvider(config as PingProviderConfig);
        break;
      
      default:
        logger.warn(`Unknown message provider type: ${providerType}, falling back to ping`);
        provider = new PingProvider(config as PingProviderConfig);
        break;
    }

    // Initialize the provider if it has an initialize method
    if (provider.initialize) {
      await provider.initialize(logger);
    }

    logger.info(`Created message provider: ${provider.getProviderName()}`);
    return provider;
  }

  /**
   * Gets a list of available provider types
   * @returns Array of available provider type names
   */
  public static getAvailableProviders(): string[] {
    return ['ping'];
  }
}