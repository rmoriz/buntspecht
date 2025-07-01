import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';

/**
 * Configuration for the Ping message provider
 */
export interface PingProviderConfig extends MessageProviderConfig {
  message?: string;
}

/**
 * Simple ping message provider
 * Posts a static message (default: "PING")
 */
export class PingProvider implements MessageProvider {
  private message: string;
  private logger?: Logger;

  constructor(config: PingProviderConfig = {}) {
    this.message = config.message || 'PING';
  }

  /**
   * Generates the ping message
   */
  public async generateMessage(): Promise<string> {
    this.logger?.debug(`Generating ping message: "${this.message}"`);
    return this.message;
  }

  /**
   * Gets the provider name
   */
  public getProviderName(): string {
    return 'ping';
  }

  /**
   * Initialize the provider
   */
  public async initialize(logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    // PingProvider doesn't use telemetry currently
    this.logger.info(`Initialized PingProvider with message: "${this.message}"`);
  }
}