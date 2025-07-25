import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';

/**
 * Interface for push provider specific methods
 */
export interface PushProviderInterface {
  isRateLimited(): boolean;
  getTimeUntilNextMessage(): number;
  getRateLimitInfo(): { messages: number; windowSeconds: number; currentCount: number; timeUntilReset: number };
  setMessage(message: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): void;
  recordMessageSent(): void;
  getConfig(): PushProviderConfig;
  getVisibility(): 'public' | 'unlisted' | 'private' | 'direct' | undefined;
}

/**
 * Configuration for the Push message provider
 */
export interface PushProviderConfig extends MessageProviderConfig {
  // Default message to use when no message is provided in the trigger
  defaultMessage?: string;
  // Whether to allow external messages or only use the default message
  allowExternalMessages?: boolean;
  // Optional validation for external messages (max length, etc.)
  maxMessageLength?: number;
  // Optional webhook secret for this specific provider (overrides global webhook secret)
  webhookSecret?: string;
  // Optional HMAC secret for this specific provider (overrides global HMAC secret)
  hmacSecret?: string;
  // HMAC algorithm for this provider (overrides global setting)
  hmacAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  // HMAC header name for this provider (overrides global setting)
  hmacHeader?: string;
  // Rate limiting configuration
  rateLimitMessages?: number; // Number of messages allowed per time window (default: 1)
  rateLimitWindowSeconds?: number; // Time window in seconds (default: 60)
  // Default visibility for this provider (overrides provider config)
  defaultVisibility?: 'public' | 'unlisted' | 'private' | 'direct';
}

/**
 * Push message provider
 * Reacts to external events/triggers instead of cron schedules
 * Messages can be provided dynamically when the provider is triggered
 */
export class PushProvider implements MessageProvider, PushProviderInterface {
  private defaultMessage: string;
  private allowExternalMessages: boolean;
  private maxMessageLength: number;
  private webhookSecret?: string;
  private hmacSecret?: string;
  private hmacAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  private hmacHeader?: string;
  private rateLimitMessages: number;
  private rateLimitWindowSeconds: number;
  private defaultVisibility?: 'public' | 'unlisted' | 'private' | 'direct';
  private messageTimestamps: number[] = []; // Track message timestamps for rate limiting
  private logger?: Logger;
  private telemetry?: TelemetryService;
  private currentMessage?: string;
  private currentVisibility?: 'public' | 'unlisted' | 'private' | 'direct';

  constructor(config: PushProviderConfig = {}) {
    this.defaultMessage = config.defaultMessage || 'Push notification from Buntspecht';
    this.allowExternalMessages = config.allowExternalMessages !== false; // Default to true
    this.maxMessageLength = config.maxMessageLength || 500; // Default 500 chars
    this.webhookSecret = config.webhookSecret;
    this.hmacSecret = config.hmacSecret;
    this.hmacAlgorithm = config.hmacAlgorithm;
    this.hmacHeader = config.hmacHeader;
    this.rateLimitMessages = config.rateLimitMessages || 1; // Default: 1 message
    this.rateLimitWindowSeconds = config.rateLimitWindowSeconds || 60; // Default: 60 seconds
    this.defaultVisibility = config.defaultVisibility;
  }

  /**
   * Generates the message content
   * Uses the current message if set, otherwise falls back to default message
   */
  public async generateMessage(): Promise<string> {
    const message = this.currentMessage || this.defaultMessage;
    this.logger?.debug(`Generating push message: "${message}"`);
    
    // Clear the current message after use to prevent reuse
    this.currentMessage = undefined;
    
    return message;
  }

  /**
   * Sets a message to be used for the next generateMessage() call
   * This is called when the provider is triggered externally
   * @param message The message content to post
   * @param visibility Optional visibility setting for this message
   */
  public setMessage(message: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): void {
    if (!this.allowExternalMessages) {
      this.logger?.warn('External messages are not allowed for this push provider, using default message');
      return;
    }

    if (message.length > this.maxMessageLength) {
      const truncatedMessage = message.substring(0, this.maxMessageLength - 3) + '...';
      this.logger?.warn(`Message truncated from ${message.length} to ${this.maxMessageLength} characters`);
      this.currentMessage = truncatedMessage;
    } else {
      this.currentMessage = message;
    }

    this.currentVisibility = visibility;

    this.logger?.debug(`Set push message: "${this.currentMessage}"${visibility ? ` with visibility: ${visibility}` : ''}`);
  }

  /**
   * Checks if the provider has a message ready to be posted
   * @returns boolean True if there's a current message or default message available
   */
  public hasMessage(): boolean {
    return !!(this.currentMessage || this.defaultMessage);
  }

  /**
   * Clears any pending message and visibility
   */
  public clearMessage(): void {
    this.currentMessage = undefined;
    this.currentVisibility = undefined;
    this.logger?.debug('Cleared pending push message and visibility');
  }

  /**
   * Gets the provider name
   */
  public getProviderName(): string {
    return 'push';
  }

  /**
   * Initialize the provider
   */
  public async initialize(logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.info(`Initialized PushProvider with default message: "${this.defaultMessage}"`);
    this.logger.info(`External messages allowed: ${this.allowExternalMessages}`);
    this.logger.info(`Max message length: ${this.maxMessageLength}`);
    this.logger.info(`Rate limiting: ${this.rateLimitMessages} message(s) per ${this.rateLimitWindowSeconds} seconds`);
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): PushProviderConfig {
    return {
      defaultMessage: this.defaultMessage,
      allowExternalMessages: this.allowExternalMessages,
      maxMessageLength: this.maxMessageLength,
      webhookSecret: this.webhookSecret,
      hmacSecret: this.hmacSecret,
      hmacAlgorithm: this.hmacAlgorithm,
      hmacHeader: this.hmacHeader,
      rateLimitMessages: this.rateLimitMessages,
      rateLimitWindowSeconds: this.rateLimitWindowSeconds
    };
  }

  /**
   * Gets the webhook secret for this provider
   */
  public getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }

  /**
   * Gets the HMAC secret for this provider
   */
  public getHmacSecret(): string | undefined {
    return this.hmacSecret;
  }

  /**
   * Gets the HMAC algorithm for this provider
   */
  public getHmacAlgorithm(): 'sha1' | 'sha256' | 'sha512' | undefined {
    return this.hmacAlgorithm;
  }

  /**
   * Gets the HMAC header name for this provider
   */
  public getHmacHeader(): string | undefined {
    return this.hmacHeader;
  }

  /**
   * Gets the current visibility setting for the next message
   * @returns The current visibility or default visibility
   */
  public getVisibility(): 'public' | 'unlisted' | 'private' | 'direct' | undefined {
    return this.currentVisibility || this.defaultVisibility;
  }

  /**
   * Checks if the provider is currently rate limited
   * @returns boolean True if rate limited, false if allowed to send
   */
  public isRateLimited(): boolean {
    const now = Date.now();
    const windowStart = now - (this.rateLimitWindowSeconds * 1000);
    
    // Track if we had messages before cleanup (for rate limit reset detection)
    const hadMessages = this.messageTimestamps.length > 0;
    
    // Remove timestamps outside the current window
    const oldLength = this.messageTimestamps.length;
    this.messageTimestamps = this.messageTimestamps.filter(timestamp => timestamp > windowStart);
    
    // If we had messages and now we don't (or significantly fewer), record a rate limit reset
    if (hadMessages && oldLength > this.messageTimestamps.length && this.telemetry) {
      this.telemetry.recordRateLimitReset('push');
      this.logger?.debug(`Rate limit window reset. Removed ${oldLength - this.messageTimestamps.length} expired timestamps`);
    }
    
    // Check if we've exceeded the rate limit
    return this.messageTimestamps.length >= this.rateLimitMessages;
  }

  /**
   * Records a message send for rate limiting purposes
   */
  public recordMessageSent(): void {
    this.messageTimestamps.push(Date.now());
    this.logger?.debug(`Recorded message send. Current count in window: ${this.messageTimestamps.length}/${this.rateLimitMessages}`);
  }

  /**
   * Gets the time until the next message can be sent (in seconds)
   * @returns number Seconds until next message allowed, 0 if not rate limited
   */
  public getTimeUntilNextMessage(): number {
    if (!this.isRateLimited()) {
      return 0;
    }
    
    const oldestTimestamp = Math.min(...this.messageTimestamps);
    const windowEnd = oldestTimestamp + (this.rateLimitWindowSeconds * 1000);
    const now = Date.now();
    
    return Math.max(0, Math.ceil((windowEnd - now) / 1000));
  }

  /**
   * Gets rate limiting information
   */
  public getRateLimitInfo(): { messages: number; windowSeconds: number; currentCount: number; timeUntilReset: number } {
    const now = Date.now();
    const windowStart = now - (this.rateLimitWindowSeconds * 1000);
    
    // Clean up old timestamps
    this.messageTimestamps = this.messageTimestamps.filter(timestamp => timestamp > windowStart);
    
    return {
      messages: this.rateLimitMessages,
      windowSeconds: this.rateLimitWindowSeconds,
      currentCount: this.messageTimestamps.length,
      timeUntilReset: this.getTimeUntilNextMessage()
    };
  }
}