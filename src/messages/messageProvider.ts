import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';

/**
 * Attachment data for social media posts
 */
export interface Attachment {
  data: string; // Base64 encoded data
  mimeType: string; // MIME type (e.g., 'image/jpeg', 'image/png')
  filename?: string; // Optional filename
  description?: string; // Optional alt text/description
}

/**
 * Message with optional attachments
 */
export interface MessageWithAttachments {
  text: string;
  attachments?: Attachment[];
}

/**
 * Interface for message providers
 * Each message provider implements different types of messages to post
 */
export interface MessageProvider {
  /**
   * Generates the message content to be posted
   * @param accountName Optional account name for account-aware providers
   * @returns Promise<string> The message content
   */
  generateMessage(accountName?: string): Promise<string>;

  /**
   * Generates the message content with optional attachments
   * @param accountName Optional account name for account-aware providers
   * @returns Promise<MessageWithAttachments> The message content with attachments
   */
  generateMessageWithAttachments?(accountName?: string): Promise<MessageWithAttachments>;

  /**
   * Gets the name/type of this message provider
   * @returns string The provider name
   */
  getProviderName(): string;

  /**
   * Optional initialization method for providers that need setup
   * @param logger Logger instance for logging
   * @param telemetry Optional telemetry service for metrics
   */
  initialize?(logger: Logger, telemetry?: TelemetryService): Promise<void>;
}

/**
 * Configuration interface for message providers
 */
export interface MessageProviderConfig {
  [key: string]: unknown;
}