import { Logger } from '../utils/logger';
import { TelemetryConfig } from './telemetryStub';

/**
 * Factory function to create the appropriate TelemetryService implementation
 * based on the runtime environment
 */
export async function createTelemetryService(config: TelemetryConfig, logger: Logger): Promise<unknown> {
  // Multiple checks to detect if we're running in a binary environment
  const isBinary = typeof process !== 'undefined' && (
    // Check if the executable name contains 'buntspecht-'
    process.argv[0]?.includes('buntspecht-') ||
    process.execPath?.includes('buntspecht-') ||
    // Check for Bun's bundle filesystem indicator
    process.cwd().includes('$bunfs') ||
    // Check if __filename contains bundle indicators (for Bun binaries)
    (typeof __filename !== 'undefined' && __filename.includes('$bunfs')) ||
    // Check if we're running from a binary by looking at argv[0] path structure
    (process.argv[0] && !process.argv[0].includes('node') && !process.argv[0].includes('bun') && process.argv[0].includes('buntspecht'))
  );

  // Always try to use stub first if config has telemetry disabled
  if (!config.enabled) {
    logger.debug('Telemetry disabled in configuration, using telemetry stub');
    const { TelemetryService } = await import('./telemetryStub');
    return new TelemetryService(config, logger);
  }

  if (isBinary) {
    // Use stub implementation for binary builds
    logger.debug('Detected binary environment, using telemetry stub');
    const { TelemetryService } = await import('./telemetryStub');
    return new TelemetryService(config, logger);
  } else {
    // Try to use full implementation, fall back to stub if OpenTelemetry is not available
    try {
      const { TelemetryService } = await import('./telemetry');
      logger.debug('Using full telemetry implementation');
      return new TelemetryService(config, logger);
    } catch (error) {
      logger.warn(`OpenTelemetry dependencies not available (${error instanceof Error ? error.message : 'unknown error'}), using telemetry stub`);
      const { TelemetryService } = await import('./telemetryStub');
      return new TelemetryService(config, logger);
    }
  }
}