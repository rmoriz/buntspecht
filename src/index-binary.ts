#!/usr/bin/env bun

// Binary-specific entry point that forces telemetry stub usage
// This ensures that binary builds never try to load OpenTelemetry modules

// Set environment variable to force stub usage
process.env.BUNTSPECHT_FORCE_STUB = 'true';

// Import and run the main application
import { main } from './index';

// Run the main function directly for binary builds
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});