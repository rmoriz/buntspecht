import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface YouTubeCaptionConfig {
  /** Whether to replace the entire message with captions or append them */
  mode: 'replace' | 'append' | 'prepend';
  /** Language code for captions (default: auto-detect) */
  language?: string;
  /** Whether to add a separator before captions when appending */
  separator?: string;
  /** Maximum caption length (default: unlimited) */
  maxLength?: number;
  /** Whether to skip if no captions are found */
  skipOnNoCaptions?: boolean;
  /** Custom skip reason when no captions found */
  skipReason?: string;
}

/**
 * Middleware for extracting YouTube video captions and processing them
 * Extracts YouTube video ID from RSS feed links, fetches auto-generated captions,
 * removes timestamps and newlines, then adds newlines before ">> " markers
 */
export class YouTubeCaptionMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: YouTubeCaptionConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;

  constructor(name: string, config: YouTubeCaptionConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      separator: '\n\n---\n\n',
      ...config,
      mode: config.mode || 'append'
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.debug(`Initialized YouTubeCaptionMiddleware: ${this.name} with mode: ${this.config.mode}`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const originalText = context.message.text;
      
      // Extract YouTube video ID from the message
      const videoId = this.extractYouTubeVideoId(originalText);
      
      if (!videoId) {
        this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: No YouTube video ID found in message`);
        await next();
        return;
      }

      this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Found YouTube video ID: ${videoId}`);

      // Fetch captions
      const captions = await this.fetchCaptions(videoId);
      
      if (!captions) {
        if (this.config.skipOnNoCaptions) {
          context.skip = true;
          context.skipReason = this.config.skipReason || `No captions found for YouTube video: ${videoId}`;
          this.logger?.info(`YouTubeCaptionMiddleware ${this.name} skipped message: ${context.skipReason}`);
          return; // Don't call next() - stop the chain
        } else {
          this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: No captions found for video ${videoId}, continuing without captions`);
          await next();
          return;
        }
      }

      // Process captions
      const processedCaptions = this.processCaptions(captions);
      
      if (!processedCaptions) {
        this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Captions processing resulted in empty text`);
        await next();
        return;
      }

      // Apply length limit if specified
      let finalCaptions = processedCaptions;
      if (this.config.maxLength && finalCaptions.length > this.config.maxLength) {
        finalCaptions = finalCaptions.substring(0, this.config.maxLength).trim();
        this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Truncated captions to ${this.config.maxLength} characters`);
      }

      // Update message based on mode
      switch (this.config.mode) {
        case 'replace':
          context.message.text = finalCaptions;
          this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Replaced message with captions`);
          break;
          
        case 'prepend':
          context.message.text = finalCaptions + (this.config.separator || '\n\n') + originalText;
          this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Prepended captions to message`);
          break;
          
        case 'append':
        default:
          context.message.text = originalText + (this.config.separator || '\n\n') + finalCaptions;
          this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Appended captions to message`);
          break;
      }

      // Store metadata
      context.data[`${this.name}_video_id`] = videoId;
      context.data[`${this.name}_captions_length`] = finalCaptions.length;
      context.data[`${this.name}_original_text`] = originalText;

      // Continue to next middleware
      await next();

    } catch (error) {
      this.logger?.error(`YouTubeCaptionMiddleware ${this.name} failed:`, error);
      
      // If we can't get captions, continue with original message unless skipOnNoCaptions is true
      if (this.config.skipOnNoCaptions) {
        context.skip = true;
        context.skipReason = this.config.skipReason || `Failed to fetch YouTube captions: ${error instanceof Error ? error.message : String(error)}`;
        this.logger?.info(`YouTubeCaptionMiddleware ${this.name} skipped message: ${context.skipReason}`);
        return; // Don't call next() - stop the chain
      }
      
      // Continue with original message
      await next();
    }
  }

  /**
   * Extract YouTube video ID from various YouTube URL formats
   */
  private extractYouTubeVideoId(text: string): string | null {
    // Common YouTube URL patterns
    const patterns = [
      // Standard watch URLs
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      // Embedded URLs
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      // YouTube shorts
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      // Mobile URLs
      /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      // RSS feed URLs (YouTube RSS feeds)
      /youtube\.com\/feeds\/videos\.xml\?channel_id=.*&v=([a-zA-Z0-9_-]{11})/,
      // Direct video ID pattern (if just the ID is in the text)
      /\b([a-zA-Z0-9_-]{11})\b/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Validate that it looks like a YouTube video ID (11 characters, alphanumeric + _ -)
        const videoId = match[1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          return videoId;
        }
      }
    }

    return null;
  }

  /**
   * Fetch captions for a YouTube video using youtube-caption-extractor
   */
  private async fetchCaptions(videoId: string): Promise<string | null> {
    try {
      // Dynamic import to handle potential module loading issues
      const { getSubtitles } = await import('youtube-caption-extractor');
      
      this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Fetching captions for video ${videoId}`);
      
      // Fetch captions - the library will auto-detect language if not specified
      const captions = await getSubtitles({
        videoID: videoId,
        lang: this.config.language || 'auto' // Use auto-detection if no language specified
      });

      if (!captions || captions.length === 0) {
        this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: No captions returned for video ${videoId}`);
        return null;
      }

      // Convert captions array to text
      const captionText = captions.map((caption: any) => caption.text || '').join(' ');
      
      if (!captionText.trim()) {
        this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Empty caption text for video ${videoId}`);
        return null;
      }

      this.logger?.debug(`YouTubeCaptionMiddleware ${this.name}: Successfully fetched ${captions.length} caption segments for video ${videoId}`);
      return captionText;

    } catch (error) {
      this.logger?.warn(`YouTubeCaptionMiddleware ${this.name}: Failed to fetch captions for video ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Process captions according to requirements:
   * 1. Remove timestamps
   * 2. Remove all newlines
   * 3. Add newlines before ">> " markers
   */
  private processCaptions(captions: string): string {
    if (!captions || typeof captions !== 'string') {
      return '';
    }

    let processed = captions;

    // Remove timestamps (various formats)
    // Common timestamp patterns: [00:00:00], (00:00), 00:00:00, etc.
    processed = processed.replace(/\[?\d{1,2}:?\d{2}:?\d{2}\.?\d*\]?/g, '');
    processed = processed.replace(/\(\d{1,2}:?\d{2}:?\d{2}\.?\d*\)/g, '');
    
    // Remove other common timestamp patterns
    processed = processed.replace(/\d{1,2}:\d{2}/g, ''); // Simple mm:ss format
    processed = processed.replace(/\[\d+\]/g, ''); // [123] format
    
    // Remove all newlines and extra whitespace
    processed = processed.replace(/\r?\n/g, ' ');
    processed = processed.replace(/\s+/g, ' ');
    
    // Add newlines before ">> " markers
    processed = processed.replace(/\s*>>\s*/g, '\n>> ');
    
    // Clean up: remove leading/trailing whitespace and normalize
    processed = processed.trim();
    
    // Remove any leading newline that might have been added
    if (processed.startsWith('\n')) {
      processed = processed.substring(1);
    }

    return processed;
  }

  public async cleanup?(): Promise<void> {
    // No cleanup needed for this middleware
  }
}