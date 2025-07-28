import { Logger } from '../../utils/logger';
import { TelemetryService } from '../telemetryInterface';
import { MessageWithAttachments } from '../../messages/messageProvider';
import { ProviderConfig } from '../../types/config';

/**
 * Context object passed through the message middleware chain
 */
export interface MessageMiddlewareContext {
  /** The original message data */
  message: MessageWithAttachments;
  /** Provider name that generated the message */
  providerName: string;
  /** Provider configuration */
  providerConfig: ProviderConfig;
  /** Target account names */
  accountNames: string[];
  /** Message visibility */
  visibility: 'public' | 'unlisted' | 'private' | 'direct';
  /** Custom data that can be set by middleware */
  data: Record<string, unknown>;
  /** Logger instance */
  logger: Logger;
  /** Telemetry service */
  telemetry: TelemetryService;
  /** Request start time for timing calculations */
  startTime: number;
  /** Whether the message should be skipped (not posted) */
  skip: boolean;
  /** Skip reason if message is skipped */
  skipReason?: string;
}

/**
 * Middleware function signature
 */
export interface MessageMiddlewareFunction {
  (context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void>;
}

/**
 * Middleware configuration
 */
export interface MessageMiddlewareConfig {
  /** Middleware name for logging and debugging */
  name: string;
  /** Whether this middleware is enabled */
  enabled?: boolean;
  /** Middleware type/class name */
  type: string;
  /** Middleware-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Base interface for middleware implementations
 */
export interface MessageMiddleware {
  /** Middleware name */
  readonly name: string;
  /** Whether this middleware is enabled */
  readonly enabled: boolean;
  /** Initialize the middleware (called once during setup) */
  initialize?(logger: Logger, telemetry: TelemetryService): Promise<void>;
  /** Execute the middleware */
  execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void>;
  /** Cleanup the middleware (called during shutdown) */
  cleanup?(): Promise<void>;
}

/**
 * Middleware execution result
 */
export interface MessageMiddlewareResult {
  /** Whether the middleware chain completed successfully */
  success: boolean;
  /** Final message data after middleware processing */
  message: MessageWithAttachments;
  /** Whether the message should be skipped */
  skip: boolean;
  /** Skip reason if message is skipped */
  skipReason?: string;
  /** Error that occurred during execution (if any) */
  error?: Error;
  /** Total execution time in milliseconds */
  executionTime: number;
  /** Number of middleware functions executed */
  middlewareCount: number;
}

/**
 * Factory interface for creating middleware instances
 */
export interface MessageMiddlewareFactory {
  /** Create a middleware instance from configuration */
  create(config: MessageMiddlewareConfig): MessageMiddleware;
  /** Get supported middleware types */
  getSupportedTypes(): string[];
}