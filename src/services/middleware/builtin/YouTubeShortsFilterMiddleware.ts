import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface YouTubeShortsFilterConfig {
  /** Whether to skip YouTube Shorts (default: true) */
  skipShorts?: boolean;
  /** Custom skip reason when shorts are found */
  skipReason?: string;
  /** Whether to log when shorts are skipped */
  logSkipped?: boolean;
}

/**
 * Middleware for filtering out YouTube Shorts
 * Detects YouTube Shorts URLs and skips the message if configured to do so
 */
export class YouTubeShortsFilterMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: YouTubeShortsFilterConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;

  constructor(name: string, config: YouTubeShortsFilterConfig = {}, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      skipShorts: true,
      logSkipped: true,
      skipReason: 'YouTube Shorts werden übersprungen',
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.debug(`Initialized YouTubeShortsFilterMiddleware: ${this.name} (skipShorts: ${this.config.skipShorts})`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const messageText = context.message.text;
      
      // Check if message contains YouTube Shorts URL
      const hasShorts = this.containsYouTubeShorts(messageText);
      
      if (hasShorts && this.config.skipShorts) {
        // Skip the message
        context.skip = true;
        context.skipReason = this.config.skipReason || 'YouTube Shorts detected and filtered';
        
        if (this.config.logSkipped) {
          this.logger?.info(`YouTubeShortsFilterMiddleware ${this.name}: Skipped message containing YouTube Shorts`);
        }
        
        // Store metadata
        context.data[`${this.name}_shorts_detected`] = true;
        context.data[`${this.name}_original_text`] = messageText;
        
        // Don't call next() - stop the middleware chain
        return;
      }
      
      // No shorts detected or not configured to skip - continue
      if (hasShorts) {
        this.logger?.debug(`YouTubeShortsFilterMiddleware ${this.name}: YouTube Shorts detected but not configured to skip`);
        context.data[`${this.name}_shorts_detected`] = true;
      } else {
        context.data[`${this.name}_shorts_detected`] = false;
      }
      
      // Continue to next middleware
      await next();

    } catch (error) {
      this.logger?.error(`YouTubeShortsFilterMiddleware ${this.name} failed:`, error);
      // Continue with next middleware even if this one fails
      await next();
    }
  }

  /**
   * Check if the text contains YouTube Shorts URLs
   */
  private containsYouTubeShorts(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    // YouTube Shorts URL patterns
    const shortsPatterns = [
      // Direct shorts URLs
      /youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/i,
      // Mobile shorts URLs
      /m\.youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/i,
      // Shorts with additional parameters
      /youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}[\?&]/i,
      // YouTube app shorts URLs
      /youtu\.be\/[a-zA-Z0-9_-]{11}.*[?&].*shorts/i
    ];

    // Check each pattern
    for (const pattern of shortsPatterns) {
      if (pattern.test(text)) {
        this.logger?.debug(`YouTubeShortsFilterMiddleware ${this.name}: Detected YouTube Shorts URL with pattern: ${pattern.source}`);
        return true;
      }
    }

    // Additional check: Look for "shorts" keyword near YouTube URLs
    const youtubeUrlPattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
    const matches = text.match(youtubeUrlPattern);
    
    if (matches) {
      // Check if "shorts" appears near any YouTube URL (within 30 characters before URL)
      for (const match of matches) {
        const matchIndex = text.indexOf(match);
        const contextStart = Math.max(0, matchIndex - 30);
        const contextEnd = matchIndex + match.length + 10; // Only check 10 chars after URL
        const context = text.substring(contextStart, contextEnd).toLowerCase();
        
        // Look for "shorts" as a word (not part of other words like "shortcuts")
        if (/\bshorts?\b/.test(context)) {
          this.logger?.debug(`YouTubeShortsFilterMiddleware ${this.name}: Detected "shorts" keyword near YouTube URL`);
          return true;
        }
      }
    }

    return false;
  }

  public async cleanup?(): Promise<void> {
    // No cleanup needed for this middleware
  }
}