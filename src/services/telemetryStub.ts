/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */

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
  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): unknown {
    return {
      setAttributes: (): void => {},
      setStatus: (): void => {},
      recordException: (): void => {},
      end: (): void => {}
    };
  }

  endSpan(_span: unknown): void {
    // No-op
  }

  addSpanEvent(_span: unknown, _name: string, _attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  recordException(_span: unknown, _exception: Error): void {
    // No-op
  }

  // Metrics methods - all no-ops
  incrementCounter(_name: string, _value: number = 1, _attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  recordHistogram(_name: string, _value: number, _attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  setGauge(_name: string, _value: number, _attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  // Convenience methods
  recordPost(_success: boolean, _provider?: string, _account?: string): void {
    // No-op
  }

  recordProviderExecution(_provider: string, _duration: number, _success: boolean): void {
    // No-op
  }

  recordError(_error: Error, _context?: string): void {
    // No-op
  }

  updateActiveConnections(_count: number): void {
    // No-op
  }
}