/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */

import { Logger } from '../utils/logger';
import { TelemetryConfig, TelemetryService as ITelemetryService, Span } from './telemetryInterface';

/**
 * Stub implementation of TelemetryService for binary builds
 * This provides the same interface but with no-op implementations
 */
export class TelemetryService implements ITelemetryService {
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
  startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): Span | undefined {
    return {
      setAttributes: (_attributes: Record<string, string | number | boolean>): void => {},
      setStatus: (_status: { code: number; message?: string }): void => {},
      recordException: (_exception: Error): void => {},
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
  recordPost(_account: string, _provider: string): void {
    // No-op
  }

  recordProviderExecution(_provider: string, _duration: number): void {
    // No-op
  }

  recordError(_type: string, _provider?: string, _account?: string): void {
    // No-op
  }

  updateActiveConnections(_count: number): void {
    // No-op
  }

  recordWebhookRequest(_provider: string, _duration: number): void {
    // No-op
  }

  // Rate limiting metrics - all no-ops
  recordRateLimitHit(_provider: string, _currentCount: number, _limit: number): void {
    // No-op
  }

  recordRateLimitReset(_provider: string): void {
    // No-op
  }

  updateRateLimitUsage(_provider: string, _currentCount: number, _limit: number): void {
    // No-op
  }

  getTracer(): unknown {
    return undefined;
  }

  getMeter(): unknown {
    return undefined;
  }
}