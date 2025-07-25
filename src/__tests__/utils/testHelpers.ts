import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';
import { BotConfig } from '../../types/config';

/**
 * Common test setup utilities
 */
export class TestHelpers {
  /**
   * Create a test logger with console methods mocked
   */
  static createTestLogger(level: 'debug' | 'info' | 'warn' | 'error' = 'debug'): Logger {
    // Mock console methods to avoid test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();

    return new Logger(level);
  }

  /**
   * Create a mock telemetry service
   */
  static createMockTelemetry(): jest.Mocked<TelemetryService> {
    return {
      startSpan: jest.fn().mockReturnValue({
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
        setAttributes: jest.fn(),
        addEvent: jest.fn(),
        isRecording: jest.fn().mockReturnValue(true),
        setAttribute: jest.fn(),
        updateName: jest.fn()
      }),
      recordPost: jest.fn(),
      recordError: jest.fn(),
      initialize: jest.fn(),
      shutdown: jest.fn(),
      recordMetric: jest.fn(),
      incrementCounter: jest.fn(),
      recordHistogram: jest.fn(),
      recordGauge: jest.fn()
    } as unknown as jest.Mocked<TelemetryService>;
  }

  /**
   * Create a basic bot configuration for testing
   */
  static createTestBotConfig(overrides: Partial<BotConfig> = {}): BotConfig {
    const defaultConfig: BotConfig = {
      accounts: [
        {
          name: 'test-account',
          type: 'mastodon',
          instance: 'https://test.mastodon',
          accessToken: 'test-token'
        }
      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['test-account'],
            config: { message: 'TEST PING' }
          }
        ]
      },
      logging: { level: 'debug' }
    };

    return this.deepMerge(defaultConfig, overrides);
  }

  /**
   * Create a Bluesky-specific test configuration
   */
  static createBlueskyTestConfig(overrides: Partial<BotConfig> = {}): BotConfig {
    const blueskyConfig: BotConfig = {
      accounts: [
        {
          name: 'test-bluesky',
          type: 'bluesky',
          instance: 'https://bsky.social',
          accessToken: '',
          identifier: 'test.bsky.social',
          password: 'test-app-password'
        }
      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['test-bluesky'],
            config: { message: 'TEST PING' }
          }
        ]
      },
      logging: { level: 'debug' }
    };

    return this.deepMerge(blueskyConfig, overrides);
  }

  /**
   * Setup common test environment
   */
  static setupTestEnvironment(): {
    logger: Logger;
    telemetry: jest.Mocked<TelemetryService>;
    config: BotConfig;
  } {
    const logger = this.createTestLogger();
    const telemetry = this.createMockTelemetry();
    const config = this.createTestBotConfig();

    return { logger, telemetry, config };
  }

  /**
   * Clean up test environment
   */
  static cleanupTestEnvironment(): void {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForAsync(ms: number = 0): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a temporary file for testing
   */
  static createTempFile(content: string, filename?: string): string {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, filename || `test-${Date.now()}.tmp`);
    
    fs.writeFileSync(tempFile, content);
    return tempFile;
  }

  /**
   * Clean up temporary file
   */
  static cleanupTempFile(filePath: string): void {
    const fs = require('fs');
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Deep merge two objects
   */
  private static deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] as any, source[key] as any);
        } else {
          result[key] = source[key] as any;
        }
      }
    }
    
    return result;
  }

  /**
   * Create a mock HTTP request object
   */
  static createMockRequest(overrides: any = {}): any {
    return {
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent'
      },
      body: '{}',
      ...overrides
    };
  }

  /**
   * Create a mock HTTP response object
   */
  static createMockResponse(): any {
    const res = {
      statusCode: 200,
      headers: {},
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      removeHeader: jest.fn()
    };

    res.writeHead.mockImplementation((statusCode: number, headers?: any) => {
      res.statusCode = statusCode;
      if (headers) {
        Object.assign(res.headers, headers);
      }
    });

    return res;
  }

  /**
   * Create HMAC signature for webhook testing
   */
  static createHmacSignature(payload: string, secret: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Assert that a function throws with a specific message
   */
  static async expectToThrowAsync(
    fn: () => Promise<any>,
    expectedMessage?: string | RegExp
  ): Promise<void> {
    let error: Error | undefined;
    
    try {
      await fn();
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    
    if (expectedMessage) {
      if (typeof expectedMessage === 'string') {
        expect(error!.message).toContain(expectedMessage);
      } else {
        expect(error!.message).toMatch(expectedMessage);
      }
    }
  }

  /**
   * Mock file system operations
   */
  static mockFileSystem(): {
    mockFs: jest.Mocked<typeof import('fs')>;
    mockOs: jest.Mocked<typeof import('os')>;
  } {
    const fs = require('fs');
    const os = require('os');

    jest.mock('fs');
    jest.mock('os');

    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockOs = os as jest.Mocked<typeof os>;

    // Set up common defaults
    mockOs.homedir.mockReturnValue('/home/user');

    return { mockFs, mockOs };
  }

  /**
   * Create a test configuration string in TOML format
   */
  static createTestConfigToml(overrides: any = {}): string {
    const defaultConfig = {
      accounts: [
        {
          name: 'test-account',
          instance: 'https://test.mastodon',
          accessToken: 'test-token'
        }
      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['test-account'],
            config: { message: 'TEST PING' }
          }
        ]
      },
      logging: { level: 'debug' }
    };

    const config = this.deepMerge(defaultConfig, overrides);

    return `
[[accounts]]
name = "${config.accounts[0].name}"
instance = "${config.accounts[0].instance}"
accessToken = "${config.accounts[0].accessToken}"

[bot]
[[bot.providers]]
name = "${config.bot.providers[0].name}"
type = "${config.bot.providers[0].type}"
cronSchedule = "${config.bot.providers[0].cronSchedule}"
enabled = ${config.bot.providers[0].enabled}
accounts = ${JSON.stringify(config.bot.providers[0].accounts)}

[bot.providers.config]
message = "${config.bot.providers[0].config.message}"

[logging]
level = "${config.logging.level}"
`;
  }
}