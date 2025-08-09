import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface UrlTrackingConfig {
  /** UTM medium parameter (default: "social") */
  utm_medium?: string;
  /** UTM source parameter (default: "mastodon") */
  utm_source?: string;
  /** UTM campaign parameter (optional) */
  utm_campaign?: string;
  /** UTM term parameter (optional) */
  utm_term?: string;
  /** UTM content parameter (optional) */
  utm_content?: string;
  /** Whether to override existing UTM parameters (default: false) */
  override_existing?: boolean;
  /** Whether to skip URLs that already have UTM parameters (default: false) */
  skip_existing_utm?: boolean;
  /** Domains to include for tracking (if empty, tracks all domains) */
  include_domains?: string[];
  /** Domains to exclude from tracking */
  exclude_domains?: string[];
  /** Whether to wrap URLs in HTML anchor tags (default: true) */
  wrap_in_html?: boolean;
  /** Custom link text for HTML anchor tags (if not provided, uses original URL) */
  link_text?: string;
}

/**
 * Middleware for adding UTM tracking parameters to URLs in messages
 */
export class UrlTrackingMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: UrlTrackingConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;

  // Simple regex to find potential URL candidates (more permissive)
  // We'll validate these with the URL constructor for robustness
  private readonly URL_CANDIDATE_REGEX = /https?:\/\/\S+/gi;

  constructor(name: string, config: UrlTrackingConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      utm_medium: 'social',
      utm_source: 'mastodon',
      override_existing: false,
      skip_existing_utm: false,
      include_domains: [],
      exclude_domains: [],
      wrap_in_html: true,
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.debug(`Initialized UrlTrackingMiddleware: ${this.name} with config:`, {
      utm_medium: this.config.utm_medium,
      utm_source: this.config.utm_source,
      utm_campaign: this.config.utm_campaign,
      override_existing: this.config.override_existing,
      skip_existing_utm: this.config.skip_existing_utm,
      include_domains: this.config.include_domains?.length || 0,
      exclude_domains: this.config.exclude_domains?.length || 0,
      wrap_in_html: this.config.wrap_in_html,
      link_text: (this.config.link_text && this.config.link_text.trim()) ? this.config.link_text : 'original_url'
    });
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const originalText = context.message.text;
      let urlsProcessed = 0;
      
      const transformedText = this.processUrls(originalText, (url) => {
        try {
          const processedUrl = this.processUrl(url);
          if (processedUrl !== url) {
            urlsProcessed++;
          }
          return processedUrl;
        } catch (error) {
          this.logger?.warn(`Failed to process URL ${url}:`, error);
          return url; // Return original URL on error
        }
      });

      if (originalText !== transformedText) {
        context.message.text = transformedText;
        
        this.logger?.debug(`UrlTrackingMiddleware ${this.name} processed ${urlsProcessed} URLs in message`);
        
        context.data[`${this.name}_original_text`] = originalText;
        context.data[`${this.name}_urls_processed`] = urlsProcessed;
        context.data[`${this.name}_transformed`] = true;

        // Record telemetry
        this.telemetry?.incrementCounter('url_tracking_middleware_processed', urlsProcessed, {
          middleware_name: this.name,
          provider_name: context.providerName
        });
      }

      // Continue to next middleware
      await next();
    } catch (error) {
      this.logger?.error(`UrlTrackingMiddleware ${this.name} failed:`, error);
      this.telemetry?.recordError('url_tracking_middleware_error', context.providerName);
      throw error;
    }
  }

  /**
   * Process URLs in text using a more robust approach
   * Uses a global regex replacement but with improved URL extraction
   */
  private processUrls(text: string, processor: (url: string) => string): string {
    return text.replace(this.URL_CANDIDATE_REGEX, (match) => {
      const validUrl = this.extractValidUrl(match);
      if (validUrl) {
        return processor(validUrl);
      }
      return match; // Return original if not a valid URL
    });
  }

  /**
   * Extract a valid URL from a candidate string
   * Uses the URL constructor to validate and normalize
   */
  private extractValidUrl(candidate: string): string | null {
    try {
      // First pass: clean up trailing punctuation but be careful with parentheses
      // Only remove trailing punctuation if it's not balanced (e.g., unmatched closing parens)
      let cleaned = candidate;
      
      // Remove trailing punctuation, but preserve balanced parentheses
      cleaned = this.cleanTrailingPunctuation(cleaned);
      
      // Try to parse with URL constructor
      const url = new URL(cleaned);
      
      // Only accept http/https URLs
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return cleaned; // Return the cleaned version, not url.toString() to preserve original format
      }
      
      return null;
    } catch {
      return null; // If URL constructor fails, it's not a valid URL
    }
  }

  /**
   * Clean trailing punctuation while preserving balanced parentheses
   */
  private cleanTrailingPunctuation(url: string): string {
    // Count parentheses to handle balanced pairs
    let openParens = 0;
    let closeParens = 0;
    
    for (const char of url) {
      if (char === '(') openParens++;
      if (char === ')') closeParens++;
    }
    
    // If parentheses are balanced, don't remove trailing closing paren
    if (openParens === closeParens && url.endsWith(')')) {
      // Remove other trailing punctuation but keep the balanced closing paren
      return url.replace(/[.,;:!?\]}"'>]+$/, '');
    }
    
    // Otherwise, remove all trailing punctuation including unbalanced parens
    return url.replace(/[.,;:!?)\]}"'>]+$/, '');
  }

  private processUrl(originalUrl: string): string {
    const trackedUrl = this.addTrackingToUrl(originalUrl);
    
    // If HTML wrapping is disabled, return the tracked URL as-is
    if (!this.config.wrap_in_html) {
      return trackedUrl;
    }
    
    // If no tracking was added (URL unchanged), don't wrap in HTML
    if (trackedUrl === originalUrl) {
      return originalUrl;
    }
    
    // Wrap in HTML anchor tag with custom or original URL as text
    const linkText = this.config.link_text || originalUrl;
    return `<a href="${trackedUrl}">${linkText}</a>`;
  }

  private addTrackingToUrl(url: string): string {
    try {
      const originalHasTrailingSlash = url.endsWith('/');
      const urlObj = new URL(url);
      
      // Check domain filters
      if (!this.shouldTrackDomain(urlObj.hostname)) {
        return url;
      }

      // Check if URL already has UTM parameters
      const hasExistingUtm = this.hasUtmParameters(urlObj);
      
      if (hasExistingUtm && this.config.skip_existing_utm) {
        return url;
      }

      // Add UTM parameters
      this.addUtmParameter(urlObj, 'utm_medium', this.config.utm_medium);
      this.addUtmParameter(urlObj, 'utm_source', this.config.utm_source);
      this.addUtmParameter(urlObj, 'utm_campaign', this.config.utm_campaign);
      this.addUtmParameter(urlObj, 'utm_term', this.config.utm_term);
      this.addUtmParameter(urlObj, 'utm_content', this.config.utm_content);

      // Convert back to string and handle trailing slash for clean URLs
      let result = urlObj.toString();
      
      // Only remove trailing slash if:
      // 1. Original URL didn't have one
      // 2. Current result has one 
      // 3. Path is just "/" (root)
      // 4. No search parameters exist (this means we didn't add any UTM params)
      if (!originalHasTrailingSlash && 
          result.endsWith('/') && 
          urlObj.pathname === '/' && 
          urlObj.search === '') {
        result = result.slice(0, -1);
      }
      
      return result;
    } catch (error) {
      // If URL parsing fails, return original URL
      this.logger?.warn(`Failed to parse URL for tracking: ${url}`, error);
      return url;
    }
  }

  private shouldTrackDomain(hostname: string): boolean {
    // If include_domains is specified, only track those domains
    if (this.config.include_domains && this.config.include_domains.length > 0) {
      return this.config.include_domains.some(domain => 
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
    }

    // If exclude_domains is specified, don't track those domains
    if (this.config.exclude_domains && this.config.exclude_domains.length > 0) {
      return !this.config.exclude_domains.some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
    }

    // By default, track all domains
    return true;
  }

  private hasUtmParameters(urlObj: URL): boolean {
    const utmParams = ['utm_medium', 'utm_source', 'utm_campaign', 'utm_term', 'utm_content'];
    return utmParams.some(param => urlObj.searchParams.has(param));
  }

  private addUtmParameter(urlObj: URL, paramName: string, paramValue: string | undefined): void {
    if (paramValue === undefined || paramValue === '') {
      return;
    }

    const hasExisting = urlObj.searchParams.has(paramName);
    
    if (!hasExisting || this.config.override_existing) {
      urlObj.searchParams.set(paramName, paramValue);
    }
  }
}