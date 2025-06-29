import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, metrics, Span, Tracer, Meter } from '@opentelemetry/api';
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

export class TelemetryService {
  private sdk?: NodeSDK;
  private tracer?: Tracer;
  private meter?: Meter;
  private logger: Logger;
  private config: TelemetryConfig;
  private isInitialized = false;

  // Metrics
  private postCounter?: unknown;
  private errorCounter?: unknown;
  private providerExecutionHistogram?: unknown;
  private activeConnectionsGauge?: unknown;

  constructor(config: TelemetryConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initializes OpenTelemetry with the configured exporters
   */
  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Telemetry is disabled');
      return;
    }

    this.logger.info('Initializing OpenTelemetry...');

    try {
      const exporters: unknown[] = [];

      // Configure Jaeger exporter for traces
      if (this.config.jaeger?.enabled) {
        const jaegerExporter = new JaegerExporter({
          endpoint: this.config.jaeger.endpoint || 'http://localhost:14268/api/traces',
        });
        exporters.push(jaegerExporter);
        this.logger.info(`Jaeger tracing enabled: ${this.config.jaeger.endpoint || 'http://localhost:14268/api/traces'}`);
      }

      // Configure Prometheus exporter for metrics
      if (this.config.prometheus?.enabled) {
        new PrometheusExporter({
          port: this.config.prometheus.port || 9090,
          endpoint: this.config.prometheus.endpoint || '/metrics',
        });
        this.logger.info(`Prometheus metrics enabled on port ${this.config.prometheus.port || 9090}`);
      }

      // Initialize the SDK
      this.sdk = new NodeSDK({
        resource: resourceFromAttributes({
          [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        }),
        instrumentations: [getNodeAutoInstrumentations({
          // Disable some instrumentations that might be noisy
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
        })],
      });

      // Start the SDK
      await this.sdk.start();

      // Initialize tracer and meter
      if (this.config.tracing?.enabled) {
        this.tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);
        this.logger.info('Tracing initialized');
      }

      if (this.config.metrics?.enabled) {
        this.meter = metrics.getMeter(this.config.serviceName, this.config.serviceVersion);
        this.initializeMetrics();
        this.logger.info('Metrics initialized');
      }

      this.isInitialized = true;
      this.logger.info('OpenTelemetry initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize OpenTelemetry:', error);
      throw error;
    }
  }

  /**
   * Initializes custom metrics
   */
  private initializeMetrics(): void {
    if (!this.meter) return;

    // Counter for successful posts
    this.postCounter = this.meter.createCounter('buntspecht_posts_total', {
      description: 'Total number of posts sent to Mastodon',
    });

    // Counter for errors
    this.errorCounter = this.meter.createCounter('buntspecht_errors_total', {
      description: 'Total number of errors encountered',
    });

    // Histogram for provider execution time
    this.providerExecutionHistogram = this.meter.createHistogram('buntspecht_provider_execution_duration_seconds', {
      description: 'Time taken to execute message providers',
      unit: 's',
    });

    // Gauge for active connections
    this.activeConnectionsGauge = this.meter.createUpDownCounter('buntspecht_active_connections', {
      description: 'Number of active Mastodon connections',
    });
  }

  /**
   * Creates a new span for tracing
   */
  public startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span | undefined {
    if (!this.tracer || !this.config.tracing?.enabled) {
      return undefined;
    }

    return this.tracer.startSpan(name, {
      attributes,
    });
  }

  /**
   * Records a successful post
   */
  public recordPost(account: string, provider: string): void {
    if (!this.config.metrics?.enabled || !this.postCounter) return;

    (this.postCounter as { add: (value: number, attributes: Record<string, string>) => void }).add(1, {
      account,
      provider,
    });
  }

  /**
   * Records an error
   */
  public recordError(type: string, provider?: string, account?: string): void {
    if (!this.config.metrics?.enabled || !this.errorCounter) return;

    (this.errorCounter as { add: (value: number, attributes: Record<string, string>) => void }).add(1, {
      error_type: type,
      provider: provider || 'unknown',
      account: account || 'unknown',
    });
  }

  /**
   * Records provider execution time
   */
  public recordProviderExecution(provider: string, durationSeconds: number): void {
    if (!this.config.metrics?.enabled || !this.providerExecutionHistogram) return;

    (this.providerExecutionHistogram as { record: (value: number, attributes: Record<string, string>) => void }).record(durationSeconds, {
      provider,
    });
  }

  /**
   * Updates active connections count
   */
  public updateActiveConnections(count: number): void {
    if (!this.config.metrics?.enabled || !this.activeConnectionsGauge) return;

    (this.activeConnectionsGauge as { add: (value: number) => void }).add(count);
  }

  /**
   * Shuts down the telemetry service
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized || !this.sdk) {
      return;
    }

    this.logger.info('Shutting down OpenTelemetry...');
    
    try {
      await this.sdk.shutdown();
      this.logger.info('OpenTelemetry shut down successfully');
    } catch (error) {
      this.logger.error('Error shutting down OpenTelemetry:', error);
    }
  }

  /**
   * Returns whether telemetry is enabled and initialized
   */
  public isEnabled(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  /**
   * Gets the tracer instance
   */
  public getTracer(): Tracer | undefined {
    return this.tracer;
  }

  /**
   * Gets the meter instance
   */
  public getMeter(): Meter | undefined {
    return this.meter;
  }
}