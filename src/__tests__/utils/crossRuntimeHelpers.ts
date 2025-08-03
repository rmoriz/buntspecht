import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';
import { BotConfig } from '../../types/config';
import { createMockFunction, spyOn, isJest, isBun } from './testRuntime';
import type { MockFunction } from './testRuntime';

/**
 * Cross-runtime test setup utilities that work with both Jest and Bun
 */
export class CrossRuntimeTestHelpers {
  /**
   * Create a test logger with console methods mocked
   */
  static createTestLogger(level: 'debug' | 'info' | 'warn' | 'error' = 'debug'): Logger {
    // Mock console methods to avoid test output
    spyOn(console, 'log').mockImplementation?.(() => {});
    spyOn(console, 'info').mockImplementation?.(() => {});
    spyOn(console, 'warn').mockImplementation?.(() => {});
    spyOn(console, 'error').mockImplementation?.(() => {});
    spyOn(console, 'debug').mockImplementation?.(() => {});

    return new Logger(level);
  }

  /**
   * Create a mock telemetry service that works in both runtimes
   */
  static createMockTelemetry(): any {
    const mockSpan = {
      setStatus: createMockFunction(),
      recordException: createMockFunction(),
      end: createMockFunction(),
      setAttributes: createMockFunction(),
      addEvent: createMockFunction(),
      isRecording: createMockFunction(() => true),
      setAttribute: createMockFunction(),
      updateName: createMockFunction()
    };

    return {
      startSpan: createMockFunction(() => mockSpan),
      recordPost: createMockFunction(),
      recordError: createMockFunction(),
      initialize: createMockFunction(),
      shutdown: createMockFunction(),
      recordMetric: createMockFunction(),
      incrementCounter: createMockFunction(),
      recordHistogram: createMockFunction(),
      recordGauge: createMockFunction()
    } as any;
  }

  /**
   * Create a mock context for middleware testing
   */
  static createMockContext() {
    return {
      message: { text: '' },
      providerName: 'test-provider',
      providerConfig: { 
        type: 'rssfeed' as const,
        name: 'test-provider',
        accounts: ['test-account'],
        config: {}
      },
      accountNames: ['test-account'],
      visibility: 'public' as const,
      data: {},
      logger: this.createTestLogger(),
      telemetry: this.createMockTelemetry(),
      startTime: Date.now(),
      skip: false
    };
  }

  /**
   * Create a mock bot config
   */
  static createMockBotConfig(): BotConfig {
    return {
      accounts: [],
      bot: {
        providers: []
      },
      logging: {
        level: 'info' as const
      },
      telemetry: {
        enabled: false,
        serviceName: 'test-service',
        serviceVersion: '1.0.0'
      }
    };
  }

  /**
   * Create mock HTTP request
   */
  static createMockRequest(options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}) {
    return {
      method: options.method || 'GET',
      url: options.url || '/',
      headers: options.headers || {},
      body: options.body || '',
      on: createMockFunction(),
      pipe: createMockFunction(),
      destroy: createMockFunction()
    };
  }

  /**
   * Create mock HTTP response
   */
  static createMockResponse() {
    return {
      statusCode: 200,
      statusMessage: 'OK',
      writeHead: createMockFunction(),
      write: createMockFunction(),
      end: createMockFunction(),
      setHeader: createMockFunction(),
      getHeader: createMockFunction(),
      removeHeader: createMockFunction()
    };
  }

  /**
   * Setup file system mocks (Jest only)
   */
  static setupFileSystemMocks() {
    if (!isJest) {
      console.warn('File system mocking is only available in Jest');
      return { mockFs: null, mockOs: null };
    }

    // This would only work in Jest
    const fs = require('fs');
    const os = require('os');
    
    if (isJest) {
      jest.mock('fs');
      jest.mock('os');
    }

    const mockFs = fs as any;
    const mockOs = os as any;

    // Setup default implementations
    mockFs.existsSync = createMockFunction(() => true);
    mockFs.readFileSync = createMockFunction(() => '{}');
    mockFs.writeFileSync = createMockFunction();
    mockFs.mkdirSync = createMockFunction();
    mockFs.statSync = createMockFunction(() => ({
      isFile: () => true,
      isDirectory: () => false,
      mtime: new Date()
    }));

    mockOs.homedir = createMockFunction(() => '/home/test');
    mockOs.tmpdir = createMockFunction(() => '/tmp');

    return { mockFs, mockOs };
  }

  /**
   * Clean up all mocks
   */
  static cleanup() {
    if (isJest) {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    }
    // For Bun, manual cleanup would be needed
  }

  /**
   * Wait for a condition to be true (useful for async testing)
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Create a promise that resolves after a delay
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export both the new helpers and maintain backward compatibility
export const TestHelpers = CrossRuntimeTestHelpers;

// Export commonly used functions
export const createMockLogger = CrossRuntimeTestHelpers.createTestLogger;
export const createMockTelemetry = CrossRuntimeTestHelpers.createMockTelemetry;
export const createMockContext = CrossRuntimeTestHelpers.createMockContext;