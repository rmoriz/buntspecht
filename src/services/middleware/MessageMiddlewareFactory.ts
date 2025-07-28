import { MessageMiddleware, MessageMiddlewareFactory, MessageMiddlewareConfig } from './types';
import { TextTransformMiddleware, TextTransformConfig } from './builtin/TextTransformMiddleware';
import { FilterMiddleware, FilterConfig } from './builtin/FilterMiddleware';
import { CommandMiddleware, CommandConfig } from './builtin/CommandMiddleware';

/**
 * Factory for creating message middleware instances
 */
export class DefaultMessageMiddlewareFactory implements MessageMiddlewareFactory {
  private static readonly SUPPORTED_TYPES = [
    'text_transform',
    'filter', 
    'command'
  ];

  /**
   * Create a middleware instance from configuration
   */
  public create(config: MessageMiddlewareConfig): MessageMiddleware {
    const enabled = config.enabled !== false; // Default to true

    switch (config.type) {
      case 'text_transform':
        return new TextTransformMiddleware(
          config.name,
          config.config as TextTransformConfig,
          enabled
        );

      case 'filter':
        return new FilterMiddleware(
          config.name,
          config.config as FilterConfig,
          enabled
        );

      case 'command':
        return new CommandMiddleware(
          config.name,
          config.config as CommandConfig,
          enabled
        );

      default:
        throw new Error(`Unsupported middleware type: ${config.type}. Supported types: ${this.getSupportedTypes().join(', ')}`);
    }
  }

  /**
   * Get supported middleware types
   */
  public getSupportedTypes(): string[] {
    return [...DefaultMessageMiddlewareFactory.SUPPORTED_TYPES];
  }
}