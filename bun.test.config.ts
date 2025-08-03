/**
 * Bun test configuration
 * This file configures Bun's test runner to be compatible with our test suite
 */

// Global test setup for Bun
import { beforeEach, afterEach } from 'bun:test';

// Make global fetch available if not already
if (typeof global.fetch === 'undefined') {
  global.fetch = fetch;
}

// Setup global test environment
beforeEach(() => {
  // Reset any global state before each test
});

afterEach(() => {
  // Cleanup after each test
});

// Export test configuration
export default {
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.spec.ts",
    "**/?(*.)+(spec|test).ts"
  ],
  testIgnore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/__tests__/utils/**"
  ],
  timeout: 30000,
  // Preload files for test setup
  preload: ["./src/__tests__/utils/testRuntime.ts"]
};