// Dynamic imports for OpenTelemetry modules to avoid binary compatibility issues
// All OpenTelemetry imports are now done dynamically within methods
import { Logger } from '../utils/logger';
import { TelemetryConfig, TelemetryService as ITelemetryService, Span } from './telemetryInterface';

export class TelemetryService implements ITelemetryService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tracer?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private meter?: any;
  private logger: Logger;
  private config: TelemetryConfig;
  private isInitialized = false;

  // Metrics
  private postCounter?: unknown;
  private errorCounter?: unknown;
  private providerExecutionHistogram?: unknown;
  private activeConnectionsGauge?: unknown;
  private rateLimitHitsCounter?: unknown;
  private rateLimitResetsCounter?: unknown;
  private rateLimitUsageGauge?: unknown;

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
      // Dynamic imports to avoid binary compatibility issues
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
      const { resourceFromAttributes } = await import('@opentelemetry/resources');
      const { SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions');
      const { trace, metrics } = await import('@opentelemetry/api');

      const exporters: unknown[] = [];

      // Configure Jaeger exporter for traces
      if (this.config.jaeger?.enabled) {
        const { JaegerExporter } = await import('@opentelemetry/exporter-jaeger');
        const jaegerExporter = new JaegerExporter({
          endpoint: this.config.jaeger.endpoint || 'http://localhost:14268/api/traces',
        });
        exporters.push(jaegerExporter);
        this.logger.info(`Jaeger tracing enabled: ${this.config.jaeger.endpoint || 'http://localhost:14268/api/traces'}`);
      }

      // Configure Prometheus exporter for metrics
      if (this.config.prometheus?.enabled) {
        const { PrometheusExporter } = await import('@opentelemetry/exporter-prometheus');
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

    // Rate limiting metrics
    this.rateLimitHitsCounter = this.meter.createCounter('buntspecht_rate_limit_hits_total', {
      description: 'Total number of rate limit hits by provider',
    });

    this.rateLimitResetsCounter = this.meter.createCounter('buntspecht_rate_limit_resets_total', {
      description: 'Total number of rate limit resets by provider',
    });

    this.rateLimitUsageGauge = this.meter.createUpDownCounter('buntspecht_rate_limit_current_count', {
      description: 'Current rate limit usage count by provider',
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
   * Records webhook request metrics
   */
  public recordWebhookRequest(provider: string, durationSeconds: number): void {
    if (!this.config.metrics?.enabled) return;

    // Record as a histogram for webhook execution time
    if (this.providerExecutionHistogram) {
      (this.providerExecutionHistogram as { record: (value: number, attributes: Record<string, string>) => void }).record(durationSeconds, {
        provider,
        type: 'webhook',
      });
    }

    // Also increment a counter for webhook requests
    if (this.postCounter) {
      (this.postCounter as { add: (value: number, attributes: Record<string, string>) => void }).add(1, {
        provider,
        type: 'webhook',
      });
    }
  }

  /**
   * Records a rate limit hit
   */
  public recordRateLimitHit(provider: string, currentCount: number, limit: number): void {
    if (!this.config.metrics?.enabled || !this.rateLimitHitsCounter) return;

    (this.rateLimitHitsCounter as { add: (value: number, attributes: Record<string, string | number>) => void }).add(1, {
      provider,
      current_count: currentCount,
      limit,
    });
  }

  /**
   * Records a rate limit reset
   */
  public recordRateLimitReset(provider: string): void {
    if (!this.config.metrics?.enabled || !this.rateLimitResetsCounter) return;

    (this.rateLimitResetsCounter as { add: (value: number, attributes: Record<string, string>) => void }).add(1, {
      provider,
    });
  }

  /**
   * Updates current rate limit usage
   */
  public updateRateLimitUsage(provider: string, currentCount: number, limit: number): void {
    if (!this.config.metrics?.enabled || !this.rateLimitUsageGauge) return;

    // Calculate usage percentage
    const usagePercentage = limit > 0 ? (currentCount / limit) * 100 : 0;

    // Record the current count with metadata about limits and usage
    (this.rateLimitUsageGauge as { add: (value: number, attributes: Record<string, string | number>) => void }).add(currentCount, {
      provider,
      limit,
      usage_percentage: Math.round(usagePercentage * 100) / 100, // Round to 2 decimal places
    });
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
  public getTracer(): unknown {
    return this.tracer;
  }

  /**
   * Gets the meter instance
   */
  public getMeter(): unknown {
    return this.meter;
  }

  // Additional methods to implement the interface
   
  endSpan(_span: unknown): void {
    // No-op - spans handle their own lifecycle
  }

   
  addSpanEvent(_span: unknown, _name: string, _attributes?: Record<string, string | number | boolean>): void {
    // No-op - not used in current implementation
  }

   
  recordException(_span: unknown, _exception: Error): void {
    // No-op - spans handle their own exceptions
  }

   
  incrementCounter(_name: string, _value: number = 1, _attributes?: Record<string, string | number | boolean>): void {
    // No-op - use specific metric methods instead
  }

   
  recordHistogram(_name: string, _value: number, _attributes?: Record<string, string | number | boolean>): void {
    // No-op - use specific metric methods instead
  }

   
  setGauge(_name: string, _value: number, _attributes?: Record<string, string | number | boolean>): void {
    // No-op - use specific metric methods instead
  }
}