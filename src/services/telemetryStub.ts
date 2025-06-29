import { Logger } from '../utils/logger';

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  jaeger?: {
    enabled: boolean;
    endpoint?: string;
  };
  prometheus?: {
    enabled: boolean;
    port?: number;
    endpoint?: string;
  };
  tracing?: {
    enabled: boolean;
  };
  metrics?: {
    enabled: boolean;
  };
}

/**
 * Stub implementation of TelemetryService for binary builds
 * This provides the same interface but with no-op implementations
 */
export class TelemetryService {
  private logger: Logger;
  private config: TelemetryConfig;

  constructor(config: TelemetryConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    if (config.enabled) {
      this.logger.warn('Telemetry is disabled in binary builds. Use Docker or bun run for telemetry support.');
    }
  }

  async initialize(): Promise<void> {
    // No-op for binary builds
  }

  async shutdown(): Promise<void> {
    // No-op for binary builds
  }

  isEnabled(): boolean {
    return false;
  }

  // Tracing methods - all no-ops
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): any {
    return {
      setAttributes: () => {},
      setStatus: () => {},
      recordException: () => {},
      end: () => {}
    };
  }

  endSpan(span: any): void {
    // No-op
  }

  addSpanEvent(span: any, name: string, attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  recordException(span: any, exception: Error): void {
    // No-op
  }

  // Metrics methods - all no-ops
  incrementCounter(name: string, value: number = 1, attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  recordHistogram(name: string, value: number, attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  setGauge(name: string, value: number, attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  // Convenience methods
  recordPost(success: boolean, provider?: string, account?: string): void {
    // No-op
  }

  recordProviderExecution(provider: string, duration: number, success: boolean): void {
    // No-op
  }

  recordError(error: Error, context?: string): void {
    // No-op
  }

  updateActiveConnections(count: number): void {
    // No-op
  }
}