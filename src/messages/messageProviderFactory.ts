import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { PingProvider, PingProviderConfig } from './pingProvider';
import { CommandProvider, CommandProviderConfig } from './commandProvider';
import { JsonCommandProvider, JsonCommandProviderConfig } from './jsonCommandProvider';
import { MultiJsonCommandProvider, MultiJsonCommandProviderConfig } from './multiJsonCommandProvider';
import { PushProvider, PushProviderConfig } from './pushProvider';
import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';

/**
 * Factory for creating message providers
 */
export class MessageProviderFactory {
  /**
   * Creates a message provider based on the provider type
   * @param providerType The type of provider to create
   * @param config Configuration for the provider
   * @param logger Logger instance
   * @param telemetry Optional telemetry service for metrics
   * @returns MessageProvider instance
   */
  public static async createProvider(
    providerType: string,
    config: MessageProviderConfig,
    logger: Logger,
    telemetry?: TelemetryService
  ): Promise<MessageProvider> {
    let provider: MessageProvider;

    switch (providerType.toLowerCase()) {
      case 'ping':
        provider = new PingProvider(config as PingProviderConfig);
        break;
      
      case 'command':
        provider = new CommandProvider(config as CommandProviderConfig);
        break;
      
      case 'jsoncommand':
        provider = new JsonCommandProvider(config as JsonCommandProviderConfig);
        break;
      
      case 'multijsoncommand':
        provider = new MultiJsonCommandProvider(config as MultiJsonCommandProviderConfig);
        break;
      
      case 'push':
        provider = new PushProvider(config as PushProviderConfig);
        break;
      
      default:
        logger.warn(`Unknown message provider type: ${providerType}, falling back to ping`);
        provider = new PingProvider(config as PingProviderConfig);
        break;
    }

    // Initialize the provider if it has an initialize method
    if (provider.initialize) {
      await provider.initialize(logger, telemetry);
    }

    logger.info(`Created message provider: ${provider.getProviderName()}`);
    return provider;
  }

  /**
   * Gets a list of available provider types
   * @returns Array of available provider type names
   */
  public static getAvailableProviders(): string[] {
    return ['ping', 'command', 'jsoncommand', 'multijsoncommand', 'push'];
  }
}