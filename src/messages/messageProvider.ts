import { Logger } from '../utils/logger';

/**
 * Interface for message providers
 * Each message provider implements different types of messages to post
 */
export interface MessageProvider {
  /**
   * Generates the message content to be posted
   * @returns Promise<string> The message content
   */
  generateMessage(): Promise<string>;

  /**
   * Gets the name/type of this message provider
   * @returns string The provider name
   */
  getProviderName(): string;

  /**
   * Optional initialization method for providers that need setup
   * @param logger Logger instance for logging
   */
  initialize?(logger: Logger): Promise<void>;
}

/**
 * Configuration interface for message providers
 */
export interface MessageProviderConfig {
  [key: string]: unknown;
}