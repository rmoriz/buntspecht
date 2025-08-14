// Create mock fetch before importing anything
const mockFetch = jest.fn();

// Mock fetch globally before any imports
Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
  configurable: true
});

// Mock crypto before imports
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mocked-hash')
  })
}));

import { ImageDescriptionMiddleware, ImageDescriptionConfig } from '../../services/middleware/builtin/ImageDescriptionMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { Logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetryStub';
import { Attachment } from '../../messages/messageProvider';

const mockedFetch = mockFetch as jest.MockedFunction<typeof fetch>;

describe('ImageDescriptionMiddleware', () => {
  let middleware: ImageDescriptionMiddleware;
  let logger: Logger;
  let telemetry: TelemetryService;
  let mockContext: MessageMiddlewareContext;
  let mockNext: jest.Mock;

  const defaultConfig: ImageDescriptionConfig = {
    provider: 'openrouter',
    apiKey: 'test-api-key',
    model: 'anthropic/claude-3-haiku',
    prompt: 'Describe this image briefly',
    timeout: 30000,
    maxTokens: 150,
    temperature: 0.3,
    onlyEmptyDescriptions: true,
    fallbackOnError: 'continue',
    enableCaching: true,
    cacheDuration: 24 * 60 * 60 * 1000,
    retry: {
      enabled: false  // Disable retry for tests to avoid timeouts
    }
  };

  const sampleImageAttachment: Attachment = {
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', // 1x1 PNG
    mimeType: 'image/png',
    filename: 'test.png',
    description: ''
  };

  beforeAll(() => {
    // Ensure fetch is properly mocked for all tests
    mockedFetch.mockClear();
  });

  beforeEach(() => {
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: 'test', serviceVersion: '1.0.0' }, logger);
    mockNext = jest.fn();

    middleware = new ImageDescriptionMiddleware('test-image-desc', defaultConfig);

    mockContext = {
      message: {
        text: 'Test message',
        attachments: []
      },
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
    
    // Mock setInterval and clearInterval
    global.setInterval = jest.fn();
    global.clearInterval = jest.fn();

    // Reset fetch mock completely
    mockedFetch.mockReset();
    mockedFetch.mockClear();
    
    // Verify the mock is in place
    expect(global.fetch).toBe(mockedFetch);
    
    // Reset context skip flag
    mockContext.skip = false;
  });

  afterEach(async () => {
    if (middleware) {
      await middleware.cleanup();
    }
    // Clear any remaining timers
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should create middleware with default config', () => {
      expect(middleware.name).toBe('test-image-desc');
      expect(middleware.enabled).toBe(true);
    });

    it('should throw error if API key is missing', () => {
      expect(() => {
        new ImageDescriptionMiddleware('test', { ...defaultConfig, apiKey: '' });
      }).toThrow('ImageDescription API key is required');
    });

    it('should throw error if model is missing', () => {
      expect(() => {
        new ImageDescriptionMiddleware('test', { ...defaultConfig, model: '' });
      }).toThrow('ImageDescription model is required');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await middleware.initialize(logger, telemetry);
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await middleware.initialize(logger, telemetry);
    });

    it('should skip processing when no attachments', async () => {
      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should skip processing when no image attachments', async () => {
      mockContext.message.attachments = [{
        data: 'dGVzdA==',
        mimeType: 'text/plain',
        filename: 'test.txt',
        description: ''
      }];

      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should process image attachments successfully', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      // Mock successful API response
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'A small test image'
            },
            finish_reason: 'stop'
          }],
          usage: {
            total_tokens: 50
          }
        })
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json'
          })
        })
      );

      expect(mockContext.message.attachments[0].description).toBe('A small test image');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip images with existing descriptions when onlyEmptyDescriptions is true', async () => {
      const attachmentWithDescription = {
        ...sampleImageAttachment,
        description: 'Existing description'
      };
      mockContext.message.attachments = [attachmentWithDescription];

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should process images with existing descriptions when onlyEmptyDescriptions is false', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, onlyEmptyDescriptions: false };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      const attachmentWithDescription = {
        ...sampleImageAttachment,
        description: 'Existing description'
      };
      mockContext.message.attachments = [attachmentWithDescription];

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'New AI description'
            }
          }]
        })
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalled();
      expect(mockContext.message.attachments[0].description).toBe('New AI description');
    });

    it('should handle API errors with continue fallback', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.skip).toBe(false);
    });

    it('should handle API errors with skip fallback', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, fallbackOnError: 'skip' as const };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockContext.skip).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle API errors with use_filename fallback', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, fallbackOnError: 'use_filename' as const };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('Image: test.png');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use cached descriptions', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      // First call - should make API request
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Cached description'
            }
          }]
        })
      } as any);

      await middleware.execute(mockContext, mockNext);
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockContext.message.attachments[0].description).toBe('Cached description');

      // Create a new attachment with same data but empty description
      mockContext.message.attachments = [{ ...sampleImageAttachment, description: '' }];

      // Second call - should use cache (no new API call)
      await middleware.execute(mockContext, mockNext);
      expect(mockedFetch).toHaveBeenCalledTimes(1); // No additional API call
      expect(mockContext.message.attachments[0].description).toBe('Cached description');
    });

    it('should skip large images', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, maxImageSize: 50 }; // Very small limit (smaller than our 96-byte test image)
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should filter unsupported image formats', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, supportedFormats: ['image/jpeg'] };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }]; // PNG format

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('different AI providers', () => {
    beforeEach(async () => {
      await middleware.initialize(logger, telemetry);
    });

    it('should work with OpenAI provider', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, provider: 'openai' as const };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'OpenAI description'
            }
          }]
        })
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key'
          })
        })
      );
    });

    it('should work with Anthropic provider', async () => {
      await middleware.cleanup(); // Clean up existing middleware
      const config = { ...defaultConfig, provider: 'anthropic' as const };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Anthropic description'
            }
          }]
        })
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        })
      );
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      await middleware.initialize(logger, telemetry);
    });

    it('should provide cache statistics', () => {
      const stats = middleware.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('entries');
      expect(Array.isArray(stats.entries)).toBe(true);
    });

    it('should clear cache manually', () => {
      middleware.clearCache();
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await middleware.initialize(logger, telemetry);
      await middleware.cleanup();
      
      // Should not throw any errors
      expect(true).toBe(true);
    });
  });

  describe('retry logic', () => {
    it('should retry on timeout errors', async () => {
      await middleware.cleanup();
      const config = { 
        ...defaultConfig, 
        retry: { 
          enabled: true, 
          maxAttempts: 2, 
          initialDelay: 1, // Very short delay for tests
          maxDelay: 10,
          backoffMultiplier: 2
        },
        enableCaching: false // Disable caching to avoid timer conflicts
      };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      // First call fails with timeout, second succeeds
      mockedFetch
        .mockRejectedValueOnce(new Error('TimeoutError: The operation timed out.'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: 'Retry success description'
              }
            }]
          })
        } as any);

      // Start the async operation
      const executePromise = middleware.execute(mockContext, mockNext);
      
      // Advance timers to handle any retry delays
      jest.runAllTimers();
      
      // Wait for completion
      await executePromise;
      
      expect(mockedFetch).toHaveBeenCalledTimes(2); // Initial call + 1 retry
      expect(mockContext.message.attachments[0].description).toBe('Retry success description');
    });

    it('should not retry on non-retryable errors', async () => {
      await middleware.cleanup();
      const config = { 
        ...defaultConfig, 
        retry: { 
          enabled: true, 
          maxAttempts: 3, 
          initialDelay: 1,
          maxDelay: 10,
          backoffMultiplier: 2
        },
        enableCaching: false
      };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      // 401 Unauthorized - should not retry
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key'
      } as any);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalledTimes(1); // No retries for 401
      expect(mockNext).toHaveBeenCalled();
    });

    it('should respect maxAttempts limit', async () => {
      await middleware.cleanup();
      const config = { 
        ...defaultConfig, 
        retry: { 
          enabled: true, 
          maxAttempts: 2, 
          initialDelay: 1,
          maxDelay: 10,
          backoffMultiplier: 2
        },
        enableCaching: false
      };
      middleware = new ImageDescriptionMiddleware('test', config);
      await middleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];

      // All calls fail with retryable error
      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error'
      } as any);

      // Start the async operation
      const executePromise = middleware.execute(mockContext, mockNext);
      
      // Advance timers to handle any retry delays
      jest.runAllTimers();
      
      // Wait for completion
      await executePromise;
      
      expect(mockedFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry (maxAttempts = 2)
      expect(mockNext).toHaveBeenCalled();
    });
  });
});