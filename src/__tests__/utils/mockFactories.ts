import { MastodonPingBot } from '../../bot';

/**
 * Factory functions for creating common mocks used across tests
 */
export class MockFactories {
  /**
   * Create a mock MastodonPingBot
   */
  static createMockBot(): jest.Mocked<MastodonPingBot> {
    return {
      isPushProvider: jest.fn(),
      triggerPushProvider: jest.fn(),
      triggerPushProviderWithVisibility: jest.fn(),
      triggerPushProviderWithVisibilityAndAttachments: jest.fn(),
      getPushProviders: jest.fn(),
      getProviderInfo: jest.fn(),
      getPushProvider: jest.fn(),
      getConfig: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      executeAllTasksNow: jest.fn(),
      executeProviderTaskNow: jest.fn(),
      warmCache: jest.fn(),
      isSchedulerRunning: jest.fn(),
      getProviderNames: jest.fn(),
      getPushProviderRateLimit: jest.fn()
    } as unknown as jest.Mocked<MastodonPingBot>;
  }

  /**
   * Create a mock Bluesky agent
   */
  static createMockBlueskyAgent(): any {
    return {
      login: jest.fn(),
      post: jest.fn(),
      getProfile: jest.fn(),
      session: {
        accessJwt: 'mock-jwt',
        refreshJwt: 'mock-refresh',
        handle: 'test.bsky.social',
        did: 'did:plc:test'
      }
    };
  }

  /**
   * Create a mock Mastodon client
   */
  static createMockMastodonClient(): any {
    return {
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      stream: jest.fn(),
      login: jest.fn(),
      verifyCredentials: jest.fn()
    };
  }

  /**
   * Create a mock message provider
   */
  static createMockMessageProvider(name: string = 'test-provider'): any {
    return {
      generateMessage: jest.fn(),
      getProviderName: jest.fn().mockReturnValue(name),
      initialize: jest.fn(),
      setProviderName: jest.fn(),
      generateMessageWithAttachments: jest.fn(),
      warmCache: jest.fn(),
      getType: jest.fn().mockReturnValue('test'),
      isEnabled: jest.fn().mockReturnValue(true)
    };
  }

  /**
   * Create a mock social media client
   */
  static createMockSocialMediaClient(): any {
    return {
      postStatus: jest.fn(),
      postStatusWithAttachments: jest.fn(),
      verifyConnection: jest.fn(),
      getAccountInfo: jest.fn(),
      initialize: jest.fn(),
      shutdown: jest.fn()
    };
  }

  /**
   * Create a mock webhook request
   */
  static createMockWebhookRequest(overrides: any = {}): any {
    return {
      method: 'POST',
      url: '/webhook',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'GitHub-Hookshot/test',
        'x-github-event': 'push',
        'x-github-delivery': 'test-delivery-id'
      },
      body: JSON.stringify({
        ref: 'refs/heads/main',
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo'
        },
        commits: [
          {
            id: 'abc123',
            message: 'Test commit',
            author: {
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        ]
      }),
      ...overrides
    };
  }

  /**
   * Create a mock webhook response
   */
  static createMockWebhookResponse(): any {
    const res = {
      statusCode: 200,
      headers: {},
      writeHead: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      removeHeader: jest.fn(),
      finished: false,
      headersSent: false
    };

    res.writeHead.mockImplementation((statusCode: number, headers?: any) => {
      if (!res.headersSent) {
        res.statusCode = statusCode;
        if (headers) {
          Object.assign(res.headers, headers);
        }
        res.headersSent = true;
      }
    });

    res.end.mockImplementation((data?: any) => {
      if (!res.finished) {
        res.finished = true;
        if (data && typeof res.write === 'function') {
          res.write(data);
        }
      }
    });

    return res;
  }

  /**
   * Create a mock file system
   */
  static createMockFileSystem(): {
    existsSync: jest.Mock;
    readFileSync: jest.Mock;
    writeFileSync: jest.Mock;
    unlinkSync: jest.Mock;
    mkdirSync: jest.Mock;
    statSync: jest.Mock;
    readdirSync: jest.Mock;
  } {
    return {
      existsSync: jest.fn(),
      readFileSync: jest.fn(),
      writeFileSync: jest.fn(),
      unlinkSync: jest.fn(),
      mkdirSync: jest.fn(),
      statSync: jest.fn(),
      readdirSync: jest.fn()
    };
  }

  /**
   * Create a mock secret resolver
   */
  static createMockSecretResolver(): any {
    return {
      resolveSecret: jest.fn(),
      resolveCredentialField: jest.fn(),
      getAvailableProviders: jest.fn().mockReturnValue(['environment', 'file']),
      isProviderAvailable: jest.fn(),
      clearCache: jest.fn(),
      getCacheStats: jest.fn(),
      setCacheEnabled: jest.fn(),
      setCacheTtl: jest.fn(),
      cleanupCache: jest.fn(),
      removeCachedSecret: jest.fn(),
      getProviders: jest.fn(),
      removeProvider: jest.fn(),
      registerProvider: jest.fn()
    };
  }

  /**
   * Create a mock scheduler
   */
  static createMockScheduler(): any {
    return {
      start: jest.fn(),
      stop: jest.fn(),
      executeAllTasksNow: jest.fn(),
      executeProviderTaskNow: jest.fn(),
      warmCache: jest.fn(),
      isSchedulerRunning: jest.fn().mockReturnValue(false),
      getProviderInfo: jest.fn(),
      getProviderNames: jest.fn(),
      triggerPushProvider: jest.fn(),
      triggerPushProviderWithAttachments: jest.fn(),
      getPushProviders: jest.fn(),
      isPushProvider: jest.fn(),
      getPushProvider: jest.fn(),
      getPushProviderRateLimit: jest.fn()
    };
  }

  /**
   * Create a mock HTTP server
   */
  static createMockHttpServer(): any {
    return {
      listen: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
      address: jest.fn().mockReturnValue({ port: 3000 }),
      listening: false,
      setTimeout: jest.fn(),
      timeout: 30000,
      keepAliveTimeout: 5000,
      headersTimeout: 60000,
      requestTimeout: 0
    };
  }

  /**
   * Create mock environment variables
   */
  static createMockEnvironment(vars: Record<string, string>): void {
    const originalEnv = process.env;
    
    beforeEach(() => {
      process.env = { ...originalEnv, ...vars };
    });

    afterEach(() => {
      process.env = originalEnv;
    });
  }

  /**
   * Create a mock rate limiter
   */
  static createMockRateLimiter(): any {
    return {
      isAllowed: jest.fn().mockReturnValue(true),
      getRemainingRequests: jest.fn().mockReturnValue(100),
      getResetTime: jest.fn().mockReturnValue(Date.now() + 60000),
      reset: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        requests: 0,
        remaining: 100,
        resetTime: Date.now() + 60000
      })
    };
  }

  /**
   * Create a mock cache
   */
  static createMockCache(): any {
    const cache = new Map();
    
    return {
      get: jest.fn().mockImplementation((key: string) => cache.get(key)),
      set: jest.fn().mockImplementation((key: string, value: any) => cache.set(key, value)),
      delete: jest.fn().mockImplementation((key: string) => cache.delete(key)),
      clear: jest.fn().mockImplementation(() => cache.clear()),
      has: jest.fn().mockImplementation((key: string) => cache.has(key)),
      size: jest.fn().mockImplementation(() => cache.size),
      keys: jest.fn().mockImplementation(() => Array.from(cache.keys())),
      values: jest.fn().mockImplementation(() => Array.from(cache.values())),
      entries: jest.fn().mockImplementation(() => Array.from(cache.entries()))
    };
  }

  /**
   * Create a mock validator
   */
  static createMockValidator(): any {
    return {
      validate: jest.fn().mockReturnValue({ valid: true }),
      validateSource: jest.fn().mockReturnValue({ valid: true }),
      validateResolvedValue: jest.fn().mockReturnValue({ valid: true }),
      validateCredentialField: jest.fn().mockReturnValue({ valid: true })
    };
  }

  /**
   * Create a mock telemetry span
   */
  static createMockTelemetrySpan(): any {
    return {
      setStatus: jest.fn(),
      recordException: jest.fn(),
      end: jest.fn(),
      setAttributes: jest.fn(),
      addEvent: jest.fn(),
      isRecording: jest.fn().mockReturnValue(true),
      setAttribute: jest.fn(),
      updateName: jest.fn()
    };
  }
}