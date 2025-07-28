import { OpenRouterMiddleware } from '../../services/middleware/builtin/OpenRouterMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';

// Mock fetch globally
global.fetch = jest.fn();
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock crypto
const mockCrypto = {
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mocked-hash')
  })
};
jest.mock('crypto', () => mockCrypto);

describe('OpenRouterMiddleware', () => {
  let logger: Logger;
  let telemetry: TelemetryService;
  let context: MessageMiddlewareContext;
  let nextMock: jest.Mock;

  beforeEach(() => {
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: 'test', serviceVersion: '1.0.0' }, logger);
    nextMock = jest.fn();
    
    context = {
      message: { text: 'Hello world' },
      providerName: 'test-provider',
      providerConfig: { name: 'test', type: 'test', accounts: [], config: {} },
      accountNames: ['test-account'],
      visibility: 'public',
      data: {},
      logger,
      telemetry,
      startTime: Date.now(),
      skip: false
    };

    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      const middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace'
      });

      await middleware.initialize(logger, telemetry);
      expect(middleware.name).toBe('test');
      expect(middleware.enabled).toBe(true);
    });

    it('should throw error when API key is missing', () => {
      expect(() => {
        new OpenRouterMiddleware('test', {
          apiKey: '',
          model: 'anthropic/claude-3-sonnet',
          prompt: 'You are a helpful assistant',
          mode: 'replace'
        });
      }).toThrow('OpenRouter API key is required');
    });

    it('should throw error when model is missing', () => {
      expect(() => {
        new OpenRouterMiddleware('test', {
          apiKey: 'test-key',
          model: '',
          prompt: 'You are a helpful assistant',
          mode: 'replace'
        });
      }).toThrow('OpenRouter model is required');
    });

    it('should throw error when prompt is missing', () => {
      expect(() => {
        new OpenRouterMiddleware('test', {
          apiKey: 'test-key',
          model: 'anthropic/claude-3-sonnet',
          prompt: '',
          mode: 'replace'
        });
      }).toThrow('OpenRouter prompt is required');
    });

    it('should set default values for optional config', async () => {
      const middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace'
      });

      await middleware.initialize(logger, telemetry);
      
      // Access private config through execution to verify defaults
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'AI response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);

      await middleware.execute(context, nextMock);
      
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"max_tokens":1000')
        })
      );
    });

    it('should start cache cleanup interval when caching enabled', async () => {
      const middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        enableCaching: true,
        cacheDuration: 1000
      });

      await middleware.initialize(logger, telemetry);
      
      // Verify interval was set
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 250);
    });
  });

  describe('execution modes', () => {
    let middleware: OpenRouterMiddleware;

    beforeEach(async () => {
      middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace'
      });
      await middleware.initialize(logger, telemetry);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'AI enhanced message' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);
    });

    it('should replace message text in replace mode', async () => {
      await middleware.execute(context, nextMock);

      expect(context.message.text).toBe('AI enhanced message');
      expect(context.data['test_original_text']).toBe('Hello world');
      expect(context.data['test_ai_response']).toBe('AI enhanced message');
      expect(nextMock).toHaveBeenCalled();
    });

    it('should prepend AI response in prepend mode', async () => {
      const prependMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'prepend'
      });
      await prependMiddleware.initialize(logger, telemetry);

      await prependMiddleware.execute(context, nextMock);

      expect(context.message.text).toBe('AI enhanced message\n\nHello world');
      expect(nextMock).toHaveBeenCalled();
    });

    it('should append AI response in append mode', async () => {
      const appendMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'append'
      });
      await appendMiddleware.initialize(logger, telemetry);

      await appendMiddleware.execute(context, nextMock);

      expect(context.message.text).toBe('Hello world\n\nAI enhanced message');
      expect(nextMock).toHaveBeenCalled();
    });

    it('should enhance message in enhance mode', async () => {
      const enhanceMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'enhance'
      });
      await enhanceMiddleware.initialize(logger, telemetry);

      await enhanceMiddleware.execute(context, nextMock);

      expect(context.message.text).toBe('AI enhanced message');
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('context handling', () => {
    let middleware: OpenRouterMiddleware;

    beforeEach(async () => {
      middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        includeContext: true
      });
      await middleware.initialize(logger, telemetry);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'AI response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);
    });

    it('should include context information when enabled', async () => {
      await middleware.execute(context, nextMock);

      const fetchCall = mockedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const userMessage = requestBody.messages[1].content;

      expect(userMessage).toContain('Provider: test-provider');
      expect(userMessage).toContain('Target accounts: test-account');
      expect(userMessage).toContain('Visibility: public');
      expect(userMessage).toContain('Message to process:\nHello world');
      expect(nextMock).toHaveBeenCalled();
    });

    it('should use custom context template when provided', async () => {
      const customMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        includeContext: true,
        contextTemplate: 'Custom context: {{providerName}} - {{visibility}}'
      });
      await customMiddleware.initialize(logger, telemetry);

      await customMiddleware.execute(context, nextMock);

      const fetchCall = mockedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const userMessage = requestBody.messages[1].content;

      expect(userMessage).toContain('Custom context: test-provider - public');
      expect(nextMock).toHaveBeenCalled();
    });

    it('should not include context when disabled', async () => {
      const noContextMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        includeContext: false
      });
      await noContextMiddleware.initialize(logger, telemetry);

      await noContextMiddleware.execute(context, nextMock);

      const fetchCall = mockedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const userMessage = requestBody.messages[1].content;

      expect(userMessage).toBe('Hello world');
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    let middleware: OpenRouterMiddleware;

    beforeEach(async () => {
      middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        enableCaching: true,
        cacheDuration: 1000
      });
      await middleware.initialize(logger, telemetry);
    });

    it('should cache API responses', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Cached response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);

      // First call
      await middleware.execute(context, nextMock);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // Second call with same context should use cache
      const context2 = { ...context, message: { text: 'Hello world' } };
      await middleware.execute(context2, nextMock);
      expect(mockedFetch).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(context2.data['test_cached']).toBe(true);
    });

    it('should expire cached responses after cache duration', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Fresh response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);

      // First call
      await middleware.execute(context, nextMock);
      expect(mockedFetch).toHaveBeenCalledTimes(1);

      // Advance time beyond cache duration
      jest.advanceTimersByTime(1500);

      // Second call should make new API request
      const context2 = { ...context, message: { text: 'Hello world' } };
      await middleware.execute(context2, nextMock);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    it('should provide cache statistics', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);

      await middleware.execute(context, nextMock);

      const stats = middleware.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);
      expect(stats.entries[0]).toHaveProperty('key');
      expect(stats.entries[0]).toHaveProperty('age');
      expect(stats.entries[0]).toHaveProperty('tokens');
    });

    it('should clear cache manually', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);

      await middleware.execute(context, nextMock);
      expect(middleware.getCacheStats().size).toBe(1);

      middleware.clearCache();
      expect(middleware.getCacheStats().size).toBe(0);
    });
  });

  describe('error handling', () => {
    let middleware: OpenRouterMiddleware;

    beforeEach(async () => {
      middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace'
      });
      await middleware.initialize(logger, telemetry);
    });

    it('should handle API errors with skip fallback', async () => {
      const skipMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        fallbackOnError: 'skip',
        skipReason: 'API failed'
      });
      await skipMiddleware.initialize(logger, telemetry);

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Server error')
      } as any);

      await skipMiddleware.execute(context, nextMock);

      expect(context.skip).toBe(true);
      expect(context.skipReason).toBe('API failed');
      expect(nextMock).not.toHaveBeenCalled();
    });

    it('should handle API errors with continue fallback', async () => {
      const continueMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        fallbackOnError: 'continue'
      });
      await continueMiddleware.initialize(logger, telemetry);

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Server error')
      } as any);

      await continueMiddleware.execute(context, nextMock);

      expect(context.skip).toBe(false);
      expect(context.message.text).toBe('Hello world'); // Original text preserved
      expect(nextMock).toHaveBeenCalled();
    });

    it('should handle API errors with use_original fallback', async () => {
      const originalMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        fallbackOnError: 'use_original'
      });
      await originalMiddleware.initialize(logger, telemetry);

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Server error')
      } as any);

      await originalMiddleware.execute(context, nextMock);

      expect(context.skip).toBe(false);
      expect(context.message.text).toBe('Hello world'); // Original text preserved
      expect(nextMock).toHaveBeenCalled();
    });

    it('should handle network timeouts', async () => {
      const timeoutMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        timeout: 100,
        fallbackOnError: 'continue'
      });
      await timeoutMiddleware.initialize(logger, telemetry);

      mockedFetch.mockImplementation(() => 
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 200))
      );

      await timeoutMiddleware.execute(context, nextMock);

      expect(context.data['test_error']).toBeDefined();
      expect(nextMock).toHaveBeenCalled();
    });

    it('should handle empty API responses', async () => {
      mockedFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [],
          usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        })
      } as any);

      const continueMiddleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        fallbackOnError: 'continue'
      });
      await continueMiddleware.initialize(logger, telemetry);

      await continueMiddleware.execute(context, nextMock);

      expect(context.data['test_error']).toContain('No response choices');
      expect(nextMock).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clear intervals and cache on cleanup', async () => {
      const middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        enableCaching: true
      });

      await middleware.initialize(logger, telemetry);
      
      // Add something to cache
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);
      await middleware.execute(context, nextMock);

      expect(middleware.getCacheStats().size).toBe(1);

      await middleware.cleanup();

      expect(middleware.getCacheStats().size).toBe(0);
      expect(clearInterval).toHaveBeenCalled();
    });
  });

  describe('telemetry', () => {
    it('should record middleware execution metrics', async () => {
      const middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace'
      });

      const mockTelemetry = {
        recordMiddlewareExecution: jest.fn(),
        recordError: jest.fn()
      };

      await middleware.initialize(logger, mockTelemetry as any);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'AI response' } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 }
        })
      };
      mockedFetch.mockResolvedValue(mockResponse as any);

      await middleware.execute(context, nextMock);

      expect(mockTelemetry.recordProviderExecution).toHaveBeenCalledWith(
        'test',
        expect.any(Number)
      );
    });

    it('should record errors in telemetry', async () => {
      const middleware = new OpenRouterMiddleware('test', {
        apiKey: 'test-key',
        model: 'anthropic/claude-3-sonnet',
        prompt: 'You are a helpful assistant',
        mode: 'replace',
        fallbackOnError: 'continue'
      });

      const mockTelemetry = {
        recordMiddlewareExecution: jest.fn(),
        recordError: jest.fn()
      };

      await middleware.initialize(logger, mockTelemetry as any);

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Server error')
      } as any);

      await middleware.execute(context, nextMock);

      expect(mockTelemetry.recordError).toHaveBeenCalledWith(
        'openrouter_middleware_failed',
        'middleware'
      );
    });
  });
});