import { Logger } from '../utils/logger';
import { TelemetryConfig } from './telemetryStub';

/**
 * Factory function to create the appropriate TelemetryService implementation
 * based on the runtime environment
 */
export async function createTelemetryService(config: TelemetryConfig, logger: Logger): Promise<unknown> {
  // Always try to use stub first if config has telemetry disabled
  if (!config.enabled) {
    logger.debug('Telemetry disabled in configuration, using telemetry stub');
    const { TelemetryService } = await import('./telemetryStub');
    return new TelemetryService(config, logger);
  }

  // Try to use full implementation first, fall back to stub if OpenTelemetry is not available
  // This approach handles both binary environments and missing dependencies gracefully
  try {
    const { TelemetryService } = await import('./telemetry');
    logger.debug('Using full telemetry implementation');
    return new TelemetryService(config, logger);
  } catch (error) {
    // This will catch both missing modules (binary environment) and other import errors
    logger.debug(`OpenTelemetry dependencies not available (${error instanceof Error ? error.message : 'unknown error'}), using telemetry stub`);
    const { TelemetryService } = await import('./telemetryStub');
    return new TelemetryService(config, logger);
  }
}