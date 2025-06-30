import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';

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
}

/**
 * Push message provider
 * Reacts to external events/triggers instead of cron schedules
 * Messages can be provided dynamically when the provider is triggered
 */
export class PushProvider implements MessageProvider {
  private defaultMessage: string;
  private allowExternalMessages: boolean;
  private maxMessageLength: number;
  private webhookSecret?: string;
  private logger?: Logger;
  private currentMessage?: string;

  constructor(config: PushProviderConfig = {}) {
    this.defaultMessage = config.defaultMessage || 'Push notification from Buntspecht';
    this.allowExternalMessages = config.allowExternalMessages !== false; // Default to true
    this.maxMessageLength = config.maxMessageLength || 500; // Default 500 chars
    this.webhookSecret = config.webhookSecret;
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
   */
  public setMessage(message: string): void {
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

    this.logger?.debug(`Set push message: "${this.currentMessage}"`);
  }

  /**
   * Checks if the provider has a message ready to be posted
   * @returns boolean True if there's a current message or default message available
   */
  public hasMessage(): boolean {
    return !!(this.currentMessage || this.defaultMessage);
  }

  /**
   * Clears any pending message
   */
  public clearMessage(): void {
    this.currentMessage = undefined;
    this.logger?.debug('Cleared pending push message');
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
  public async initialize(logger: Logger): Promise<void> {
    this.logger = logger;
    this.logger.info(`Initialized PushProvider with default message: "${this.defaultMessage}"`);
    this.logger.info(`External messages allowed: ${this.allowExternalMessages}`);
    this.logger.info(`Max message length: ${this.maxMessageLength}`);
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): PushProviderConfig {
    return {
      defaultMessage: this.defaultMessage,
      allowExternalMessages: this.allowExternalMessages,
      maxMessageLength: this.maxMessageLength,
      webhookSecret: this.webhookSecret
    };
  }

  /**
   * Gets the webhook secret for this provider
   */
  public getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }
}