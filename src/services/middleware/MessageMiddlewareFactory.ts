import { MessageMiddleware, MessageMiddlewareFactory, MessageMiddlewareConfig } from './types';
import { TextTransformMiddleware, TextTransformConfig } from './builtin/TextTransformMiddleware';
import { FilterMiddleware, FilterConfig } from './builtin/FilterMiddleware';
import { CommandMiddleware, CommandConfig } from './builtin/CommandMiddleware';
import { TemplateMiddleware, TemplateConfig } from './builtin/TemplateMiddleware';
import { RateLimitMiddleware, RateLimitConfig } from './builtin/RateLimitMiddleware';
import { ScheduleMiddleware, ScheduleConfig } from './builtin/ScheduleMiddleware';
import { ConditionalMiddleware, ConditionalConfig } from './builtin/ConditionalMiddleware';
import { AttachmentMiddleware, AttachmentConfig } from './builtin/AttachmentMiddleware';
import { OpenRouterMiddleware, OpenRouterConfig } from './builtin/OpenRouterMiddleware';
import { YouTubeCaptionMiddleware, YouTubeCaptionConfig } from './builtin/YouTubeCaptionMiddleware';
import { YouTubeShortsFilterMiddleware, YouTubeShortsFilterConfig } from './builtin/YouTubeShortsFilterMiddleware';
import { YouTubeVideoFilterMiddleware, YouTubeVideoFilterConfig } from './builtin/YouTubeVideoFilterMiddleware';
import { YouTubePremiereFilterMiddleware, YouTubePremiereFilterConfig } from './builtin/YouTubePremiereFilterMiddleware';
import { UrlTrackingMiddleware, UrlTrackingConfig } from './builtin/UrlTrackingMiddleware';

/**
 * Factory for creating message middleware instances
 */
export class DefaultMessageMiddlewareFactory implements MessageMiddlewareFactory {
  private static readonly SUPPORTED_TYPES = [
    'text_transform',
    'filter', 
    'command',
    'template',
    'rate_limit',
    'schedule',
    'conditional',
    'attachment',
    'openrouter',
    'youtube_caption',
    'youtube_shorts_filter',
    'youtube_video_filter',
    'youtube_premiere_filter',
    'url_tracking'
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
          config.config as unknown as TextTransformConfig,
          enabled
        );

      case 'filter':
        return new FilterMiddleware(
          config.name,
          config.config as unknown as FilterConfig,
          enabled
        );

      case 'command':
        return new CommandMiddleware(
          config.name,
          config.config as unknown as CommandConfig,
          enabled
        );

      case 'template':
        return new TemplateMiddleware(
          config.name,
          config.config as unknown as TemplateConfig,
          enabled
        );

      case 'rate_limit':
        return new RateLimitMiddleware(
          config.name,
          config.config as unknown as RateLimitConfig,
          enabled
        );

      case 'schedule':
        return new ScheduleMiddleware(
          config.name,
          config.config as unknown as ScheduleConfig,
          enabled
        );

      case 'conditional':
        return new ConditionalMiddleware(
          config.name,
          config.config as unknown as ConditionalConfig,
          enabled
        );

      case 'attachment':
        return new AttachmentMiddleware(
          config.name,
          config.config as unknown as AttachmentConfig,
          enabled
        );

      case 'openrouter':
        return new OpenRouterMiddleware(
          config.name,
          config.config as unknown as OpenRouterConfig,
          enabled
        );

      case 'youtube_caption':
        return new YouTubeCaptionMiddleware(
          config.name,
          config.config as unknown as YouTubeCaptionConfig,
          enabled
        );

      case 'youtube_shorts_filter':
        return new YouTubeShortsFilterMiddleware(
          config.name,
          config.config as unknown as YouTubeShortsFilterConfig,
          enabled
        );

      case 'youtube_video_filter':
        return new YouTubeVideoFilterMiddleware(
          config.name,
          config.config as unknown as YouTubeVideoFilterConfig,
          enabled
        );

      case 'youtube_premiere_filter':
        return new YouTubePremiereFilterMiddleware(
          config.name,
          config.config as unknown as YouTubePremiereFilterConfig,
          enabled
        );

      case 'url_tracking':
        return new UrlTrackingMiddleware(
          config.name,
          config.config as unknown as UrlTrackingConfig,
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