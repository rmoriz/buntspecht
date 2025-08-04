import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface YouTubePremiereFilterConfig {
  /** Whether to skip YouTube Premieres (default: true) */
  skipPremieres?: boolean;
  /** Custom skip reason when premieres are found */
  skipReason?: string;
  /** Whether to log when premieres are skipped */
  logSkipped?: boolean;
}

/**
 * Middleware for filtering out YouTube Premieres
 * Detects YouTube Premieres in RSS feeds by checking for <media:statistics views="0"/>
 * and skips the message if configured to do so
 */
export class YouTubePremiereFilterMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: YouTubePremiereFilterConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;

  constructor(name: string, config: YouTubePremiereFilterConfig = {}, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      skipPremieres: true,
      logSkipped: true,
      skipReason: 'YouTube Premiere wird übersprungen',
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.debug(`Initialized YouTubePremiereFilterMiddleware: ${this.name} (skipPremieres: ${this.config.skipPremieres})`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const messageText = context.message.text;
      const messageData = context.data;
      
      // Check if message contains a YouTube Premiere
      const isPremiere = this.isYouTubePremiere(messageText, messageData);
      
      if (isPremiere && this.config.skipPremieres) {
        // Skip the message
        context.skip = true;
        context.skipReason = this.config.skipReason || 'YouTube Premiere detected and filtered';
        
        if (this.config.logSkipped) {
          this.logger?.info(`YouTubePremiereFilterMiddleware ${this.name}: Skipped message containing YouTube Premiere`);
        }
        
        // Store metadata
        context.data[`${this.name}_premiere_detected`] = true;
        context.data[`${this.name}_original_text`] = messageText;
        
        // Don't call next() - stop the middleware chain
        return;
      }
      
      // No premiere detected or not configured to skip - continue
      if (isPremiere) {
        this.logger?.debug(`YouTubePremiereFilterMiddleware ${this.name}: YouTube Premiere detected but not configured to skip`);
        context.data[`${this.name}_premiere_detected`] = true;
      } else {
        context.data[`${this.name}_premiere_detected`] = false;
      }
      
      // Continue to next middleware
      await next();

    } catch (error) {
      this.logger?.error(`YouTubePremiereFilterMiddleware ${this.name} failed:`, error);
      // Continue with next middleware even if this one fails
      await next();
    }
  }

  /**
   * Check if the message contains a YouTube Premiere
   * Identifies premieres by looking for <media:statistics views="0"/> in RSS feed content
   */
  private isYouTubePremiere(text: string, contextData: Record<string, unknown>): boolean {
    // Check if we have the original XML content in context data
    const originalContent = contextData['rss_original_content'];
    if (originalContent && typeof originalContent === 'string') {
      // Look for media:statistics with views="0", which indicates a premiere
      const mediaStatsPattern = /<media:statistics\s+views="0"\/>/i;
      if (mediaStatsPattern.test(originalContent)) {
        this.logger?.debug(`YouTubePremiereFilterMiddleware ${this.name}: Detected YouTube Premiere via media:statistics views="0"`);
        return true;
      }
    }

    // Fallback: Check if text contains YouTube URLs and premiere-related keywords
    if (text && typeof text === 'string') {
      // Check for YouTube URL and premiere keywords in proximity
      const youtubeUrlPattern = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
      const matches = text.match(youtubeUrlPattern);
      
      if (matches) {
        // Look for "premiere" keyword in the text
        const premiereKeywords = [
          /\bpremiere\b/i,
          /\bpremieres\b/i,
          /\bpremiering\b/i,
          /\bpremiert\b/i,
          /\bpremiere in\b/i,
          /\bset reminder\b/i,
          /\bset a reminder\b/i,
          /\bcoming soon\b/i,
          /\bscheduled for\b/i
        ];
        
        for (const keyword of premiereKeywords) {
          if (keyword.test(text)) {
            this.logger?.debug(`YouTubePremiereFilterMiddleware ${this.name}: Detected premiere keyword in text: ${keyword.source}`);
            return true;
          }
        }
      }
    }

    return false;
  }

  public async cleanup?(): Promise<void> {
    // No cleanup needed for this middleware
  }
}