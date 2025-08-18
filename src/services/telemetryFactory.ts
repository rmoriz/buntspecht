import { Logger } from '../utils/logger';
import { TelemetryConfig } from './telemetryInterface';

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

  // Enhanced binary detection with multiple checks
  const isBinary = typeof process !== 'undefined' && (
    // Check for Bun's bundle filesystem indicator in various locations
    process.cwd().includes('$bunfs') ||
    process.execPath?.includes('$bunfs') ||
    (typeof __filename !== 'undefined' && __filename.includes('$bunfs')) ||
    // Check if the executable name contains 'buntspecht-'
    process.argv[0]?.includes('buntspecht-') ||
    process.execPath?.includes('buntspecht-') ||
    // Check if we're running from a binary by looking at argv[0] path structure
    (process.argv[0] && process.argv[0].startsWith('/') && process.argv[0].includes('buntspecht') && !process.argv[0].includes('/node_modules/')) ||
    // Additional check for Bun binary environment variables
    process.env.BUN_RUNTIME === 'binary' ||
    // Check if process.execPath ends with a buntspecht binary name
    process.execPath?.endsWith('buntspecht-linux-x64') ||
    process.execPath?.endsWith('buntspecht-linux-arm64') ||
    process.execPath?.endsWith('buntspecht-macos-arm64') ||
    process.execPath?.endsWith('test-binary-detection') ||
    process.execPath?.endsWith('test-otel-import')
  );

  // FORCE stub usage for binary builds - Bun's --external flags don't work reliably
  // This ensures that binary builds always use the stub regardless of detection
  const forceBinaryStub = process.env.BUNTSPECHT_FORCE_STUB === 'true' || 
    (typeof process !== 'undefined' && process.execPath && !process.execPath.includes('node'));

  if (isBinary || forceBinaryStub) {
    logger.debug(`Using telemetry stub (binary: ${isBinary}, forced: ${forceBinaryStub})`);
    const { TelemetryService } = await import('./telemetryStub');
    return new TelemetryService(config, logger);
  }

  // Try to use full implementation, fall back to stub if OpenTelemetry is not available
  try {
    const { TelemetryService } = await import('./telemetry');
    logger.debug('Using full telemetry implementation');
    return new TelemetryService(config, logger);
  } catch (error) {
    // This will catch missing modules and other import errors
    logger.debug(`OpenTelemetry dependencies not available (${error instanceof Error ? error.message : 'unknown error'}), using telemetry stub`);
    const { TelemetryService } = await import('./telemetryStub');
    return new TelemetryService(config, logger);
  }
}