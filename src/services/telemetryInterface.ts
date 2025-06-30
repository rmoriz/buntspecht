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

export interface Span {
  setAttributes(attributes: Record<string, string | number | boolean>): void;
  setStatus(status: { code: number; message?: string }): void;
  recordException(exception: Error): void;
  end(): void;
}

export interface TelemetryService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  isEnabled(): boolean;
  
  // Tracing methods
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span | undefined;
  endSpan(span: unknown): void;
  addSpanEvent(span: unknown, name: string, attributes?: Record<string, string | number | boolean>): void;
  recordException(span: unknown, exception: Error): void;
  
  // Metrics methods
  incrementCounter(name: string, value?: number, attributes?: Record<string, string | number | boolean>): void;
  recordHistogram(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
  setGauge(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
  
  // Convenience methods
  recordPost(account: string, provider: string): void;
  recordProviderExecution(provider: string, duration: number): void;
  recordError(type: string, provider?: string, account?: string): void;
  updateActiveConnections(count: number): void;
  
  // Getter methods
  getTracer(): unknown;
  getMeter(): unknown;
}