import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface YouTubeVideoFilterConfig {
  /** Whether to enable video length filtering */
  enableLengthFilter?: boolean;
  /** Minimum video length in seconds (videos shorter than this will be skipped) */
  minLengthSeconds?: number;
  /** Maximum video length in seconds (videos longer than this will be skipped) */
  maxLengthSeconds?: number;
  
  /** Title patterns to include (positive filter) - if specified, only videos matching these patterns will be included */
  titleInclude?: string[];
  /** Title patterns to exclude (negative filter) - videos matching these patterns will be skipped */
  titleExclude?: string[];
  /** Whether title pattern matching is case sensitive (default: false) */
  caseSensitive?: boolean;
  /** Whether to use regex for title patterns (default: false, uses simple string contains) */
  useRegex?: boolean;
  
  /** Custom skip reason when videos are filtered */
  skipReason?: string;
  /** Whether to log when videos are skipped (default: true) */
  logSkipped?: boolean;
  /** Whether to log detailed filter information (default: false) */
  logDetails?: boolean;
  
  /** Request timeout for YouTube API calls in milliseconds (default: 10000) */
  timeout?: number;
  /** Number of retry attempts for API calls (default: 2) */
  retries?: number;
  /** Cache duration for video metadata in milliseconds (default: 3600000 = 1 hour) */
  cacheDuration?: number;
}

interface VideoMetadata {
  id: string;
  title: string;
  durationSeconds: number;
  publishedAt: string;
  cached: boolean;
  cacheTime: number;
}

/**
 * Middleware for filtering YouTube videos by length and title patterns
 * Fetches video metadata from YouTube RSS feeds and applies configurable filters
 */
export class YouTubeVideoFilterMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: YouTubeVideoFilterConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;
  private metadataCache = new Map<string, VideoMetadata>();
  private cacheCleanupInterval?: NodeJS.Timeout;

  constructor(name: string, config: YouTubeVideoFilterConfig = {}, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      enableLengthFilter: false,
      minLengthSeconds: 0,
      maxLengthSeconds: Number.MAX_SAFE_INTEGER,
      titleInclude: [],
      titleExclude: [],
      caseSensitive: false,
      useRegex: false,
      logSkipped: true,
      logDetails: false,
      timeout: 10000,
      retries: 2,
      cacheDuration: 3600000, // 1 hour
      skipReason: 'Video filtered by YouTube video filter',
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    
    // Start cache cleanup interval
    if (this.config.cacheDuration! > 0) {
      this.cacheCleanupInterval = setInterval(() => {
        this.cleanupCache();
      }, this.config.cacheDuration! / 4); // Cleanup every quarter of cache duration
    }
    
    this.logger.debug(`Initialized YouTubeVideoFilterMiddleware: ${this.name}`, {
      enableLengthFilter: this.config.enableLengthFilter,
      minLengthSeconds: this.config.minLengthSeconds,
      maxLengthSeconds: this.config.maxLengthSeconds,
      titleIncludeCount: this.config.titleInclude?.length || 0,
      titleExcludeCount: this.config.titleExclude?.length || 0
    });
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const messageText = context.message.text;
      
      // Extract YouTube video URLs from the message
      const videoIds = this.extractYouTubeVideoIds(messageText);
      
      if (videoIds.length === 0) {
        // No YouTube videos found, continue to next middleware
        if (this.config.logDetails) {
          this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: No YouTube videos found in message`);
        }
        await next();
        return;
      }

      // Process each video ID
      for (const videoId of videoIds) {
        const shouldSkip = await this.shouldSkipVideo(videoId, messageText);
        
        if (shouldSkip.skip) {
          // Skip the message
          context.skip = true;
          context.skipReason = shouldSkip.reason || this.config.skipReason!;
          
          if (this.config.logSkipped) {
            this.logger?.info(`YouTubeVideoFilterMiddleware ${this.name}: Skipped video ${videoId} - ${shouldSkip.reason}`);
          }
          
          // Store metadata
          context.data[`${this.name}_filtered_video_id`] = videoId;
          context.data[`${this.name}_filter_reason`] = shouldSkip.reason;
          context.data[`${this.name}_original_text`] = messageText;
          
          // Don't call next() - stop the middleware chain
          return;
        }
      }
      
      // All videos passed filters, continue to next middleware
      if (this.config.logDetails) {
        this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: All videos passed filters`);
      }
      
      // Store metadata about processed videos
      context.data[`${this.name}_processed_video_ids`] = videoIds;
      context.data[`${this.name}_videos_passed`] = true;
      
      await next();

    } catch (error) {
      this.logger?.error(`YouTubeVideoFilterMiddleware ${this.name} failed:`, error);
      // Continue with next middleware even if this one fails
      await next();
    }
  }

  /**
   * Extract YouTube video IDs from text
   */
  private extractYouTubeVideoIds(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const videoIds: string[] = [];
    
    // YouTube URL patterns
    const patterns = [
      // Standard watch URLs
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi,
      // Embedded URLs
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/gi,
      // YouTube Music URLs
      /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const videoId = match[1];
        if (videoId && !videoIds.includes(videoId)) {
          videoIds.push(videoId);
        }
      }
    }

    return videoIds;
  }

  /**
   * Determine if a video should be skipped based on configured filters
   */
  private async shouldSkipVideo(videoId: string, messageText: string): Promise<{ skip: boolean; reason?: string }> {
    try {
      // Get video metadata
      const metadata = await this.getVideoMetadata(videoId);
      
      if (!metadata) {
        if (this.config.logDetails) {
          this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Could not fetch metadata for video ${videoId}`);
        }
        // If we can't get metadata, don't skip (fail open)
        return { skip: false };
      }

      // Apply length filter
      if (this.config.enableLengthFilter) {
        const minLength = this.config.minLengthSeconds || 0;
        const maxLength = this.config.maxLengthSeconds || Number.MAX_SAFE_INTEGER;
        
        if (metadata.durationSeconds < minLength) {
          return { 
            skip: true, 
            reason: `Video too short: ${this.formatDuration(metadata.durationSeconds)} < ${this.formatDuration(minLength)}` 
          };
        }
        
        if (metadata.durationSeconds > maxLength) {
          return { 
            skip: true, 
            reason: `Video too long: ${this.formatDuration(metadata.durationSeconds)} > ${this.formatDuration(maxLength)}` 
          };
        }
      }

      // Apply title filters
      const titleFilterResult = this.applyTitleFilters(metadata.title);
      if (titleFilterResult.skip) {
        return titleFilterResult;
      }

      // All filters passed
      if (this.config.logDetails) {
        this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Video ${videoId} passed all filters`, {
          title: metadata.title,
          duration: this.formatDuration(metadata.durationSeconds)
        });
      }
      
      return { skip: false };

    } catch (error) {
      this.logger?.warn(`YouTubeVideoFilterMiddleware ${this.name}: Error checking video ${videoId}:`, error);
      // If there's an error, don't skip (fail open)
      return { skip: false };
    }
  }

  /**
   * Apply title-based filters
   */
  private applyTitleFilters(title: string): { skip: boolean; reason?: string } {
    if (!title) {
      return { skip: false };
    }

    const processedTitle = this.config.caseSensitive ? title : title.toLowerCase();

    // Check exclude patterns first (if any match, video is excluded)
    if (this.config.titleExclude && this.config.titleExclude.length > 0) {
      for (const pattern of this.config.titleExclude) {
        if (this.matchesPattern(processedTitle, pattern)) {
          return { 
            skip: true, 
            reason: `Title matches exclude pattern: "${pattern}"` 
          };
        }
      }
    }

    // Check include patterns (if specified, at least one must match)
    if (this.config.titleInclude && this.config.titleInclude.length > 0) {
      let hasMatch = false;
      for (const pattern of this.config.titleInclude) {
        if (this.matchesPattern(processedTitle, pattern)) {
          hasMatch = true;
          break;
        }
      }
      
      if (!hasMatch) {
        return { 
          skip: true, 
          reason: `Title does not match any include patterns` 
        };
      }
    }

    return { skip: false };
  }

  /**
   * Check if text matches a pattern (regex or string contains)
   */
  private matchesPattern(text: string, pattern: string): boolean {
    const processedPattern = this.config.caseSensitive ? pattern : pattern.toLowerCase();
    
    if (this.config.useRegex) {
      try {
        const regex = new RegExp(processedPattern, this.config.caseSensitive ? '' : 'i');
        return regex.test(this.config.caseSensitive ? text : text.toLowerCase());
      } catch (error) {
        this.logger?.warn(`YouTubeVideoFilterMiddleware ${this.name}: Invalid regex pattern: ${pattern}`, error);
        // Fallback to string contains
        return text.includes(processedPattern);
      }
    } else {
      return text.includes(processedPattern);
    }
  }

  /**
   * Get video metadata (with caching)
   */
  private async getVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
    // Check cache first
    const cached = this.metadataCache.get(videoId);
    if (cached && this.isCacheValid(cached)) {
      if (this.config.logDetails) {
        this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Using cached metadata for video ${videoId}`);
      }
      return { ...cached, cached: true };
    }

    // Fetch from YouTube
    const metadata = await this.fetchVideoMetadata(videoId);
    if (metadata) {
      // Cache the result
      this.metadataCache.set(videoId, {
        ...metadata,
        cached: false,
        cacheTime: Date.now()
      });
    }

    return metadata;
  }

  /**
   * Fetch video metadata from YouTube (using oembed API as fallback)
   */
  private async fetchVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
    const maxRetries = this.config.retries || 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use YouTube oEmbed API (no API key required, but limited data)
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        try {
          const response = await fetch(oembedUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Buntspecht YouTube Filter/1.0'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`YouTube oEmbed API returned ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json() as { title?: string; [key: string]: unknown };
          
          // oEmbed doesn't provide duration, so we'll try to extract it from the page
          const duration = await this.extractDurationFromPage(videoId);
          
          return {
            id: videoId,
            title: data.title || 'Unknown Title',
            durationSeconds: duration || 0,
            publishedAt: '', // Not available in oEmbed
            cached: false,
            cacheTime: Date.now()
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
        

      } catch (error) {
        lastError = error as Error;
        this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Attempt ${attempt}/${maxRetries} failed for video ${videoId}:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.logger?.warn(`YouTubeVideoFilterMiddleware ${this.name}: Failed to fetch metadata for video ${videoId} after ${maxRetries} attempts:`, lastError);
    return null;
  }

  /**
   * Extract video duration from YouTube page (fallback method)
   */
  private async extractDurationFromPage(videoId: string): Promise<number | null> {
    try {
      const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      try {
        const response = await fetch(pageUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          return null;
        }
        
        const html = await response.text();
        
        // Look for duration in various formats
        const patterns = [
          // JSON-LD structured data
          /"duration":"PT(\d+)M(\d+)S"/,
          /"duration":"PT(\d+)H(\d+)M(\d+)S"/,
          /"duration":"PT(\d+)S"/,
          // Meta tags
          /content="PT(\d+)M(\d+)S"/,
          /content="PT(\d+)H(\d+)M(\d+)S"/,
          /content="PT(\d+)S"/
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match) {
            return this.parseDuration(match[0]);
          }
        }
        
        return null;
        
      } catch (error) {
        clearTimeout(timeoutId);
        this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Could not extract duration from page for video ${videoId}:`, error);
        return null;
      }
    } catch (error) {
      this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Could not extract duration from page for video ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Parse ISO 8601 duration format (PT1H2M3S) to seconds
   */
  private parseDuration(durationStr: string): number {
    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format duration in seconds to human-readable format
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Check if cached metadata is still valid
   */
  private isCacheValid(metadata: VideoMetadata): boolean {
    if (!this.config.cacheDuration || this.config.cacheDuration <= 0) {
      return false;
    }
    
    const age = Date.now() - metadata.cacheTime;
    return age < this.config.cacheDuration;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [videoId, metadata] of this.metadataCache.entries()) {
      if (!this.isCacheValid(metadata)) {
        this.metadataCache.delete(videoId);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && this.config.logDetails) {
      this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Cleaned up ${cleaned} expired cache entries`);
    }
  }

  public async cleanup(): Promise<void> {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = undefined;
    }
    
    this.metadataCache.clear();
    this.logger?.debug(`YouTubeVideoFilterMiddleware ${this.name}: Cleanup completed`);
  }
}