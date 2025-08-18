// Create mock fetch before importing anything
const mockFetch = jest.fn();

// Mock fetch globally before any imports
Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
  configurable: true
});

// Mock AbortSignal.timeout
const mockAbortSignal = {
  aborted: false,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn()
};

Object.defineProperty(global, 'AbortSignal', {
  value: {
    timeout: jest.fn().mockReturnValue(mockAbortSignal)
  },
  writable: true,
  configurable: true
});

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
    retry: {
      enabled: false  // Disable retry for tests to avoid timeouts
    }
  };

  const sampleImageAttachment: Attachment = {
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', // 1x1 PNG
    mimeType: 'image/png',
    filename: 'test.png',
    description: undefined
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: "test", serviceVersion: "1.0.0" }, logger);
    
    mockNext = jest.fn();
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

    middleware = new ImageDescriptionMiddleware('test-image-desc', defaultConfig);
  });

  afterEach(async () => {
    await middleware.cleanup();
  });

  describe('constructor', () => {
    it('should create middleware with default config', () => {
      expect(middleware.name).toBe('test-image-desc');
      expect(middleware.enabled).toBe(true);
    });

    it('should throw error if API key is missing', () => {
      expect(() => {
        new ImageDescriptionMiddleware('test', {
          provider: 'openrouter',
          apiKey: '',
          model: 'test-model'
        });
      }).toThrow('ImageDescription API key is required');
    });

    it('should throw error if model is missing', () => {
      expect(() => {
        new ImageDescriptionMiddleware('test', {
          provider: 'openrouter',
          apiKey: 'test-key',
          model: ''
        });
      }).toThrow('ImageDescription model is required');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await middleware.initialize(logger, telemetry);
      // Should not throw
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await middleware.initialize(logger, telemetry);
    });

    it('should skip processing when no attachments', async () => {
      mockContext.message.attachments = [];
      
      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should skip processing when no image attachments', async () => {
      mockContext.message.attachments = [{
        data: 'text-data',
        mimeType: 'text/plain',
        filename: 'test.txt'
      }];
      
      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should process image attachments successfully', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'A small test image' },
            finish_reason: 'stop'
          }],
          usage: { total_tokens: 50 }
        })
      } as Response);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('A small test image');
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('should skip images with existing descriptions when onlyEmptyDescriptions is true', async () => {
      const imageWithDescription = {
        ...sampleImageAttachment,
        description: 'Existing description'
      };
      mockContext.message.attachments = [imageWithDescription];
      
      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(mockContext.message.attachments[0].description).toBe('Existing description');
    });

    it('should process images with existing descriptions when onlyEmptyDescriptions is false', async () => {
      const configWithProcessAll = { ...defaultConfig, onlyEmptyDescriptions: false };
      const middlewareWithProcessAll = new ImageDescriptionMiddleware('test', configWithProcessAll);
      await middlewareWithProcessAll.initialize(logger, telemetry);

      const imageWithDescription = {
        ...sampleImageAttachment,
        description: 'Existing description'
      };
      mockContext.message.attachments = [imageWithDescription];
      
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'New AI description' },
            finish_reason: 'stop'
          }]
        })
      } as Response);

      await middlewareWithProcessAll.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('New AI description');
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors with continue fallback', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockRejectedValueOnce(new Error('AI API error: 500 Internal Server Error - Server error'));

      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.skip).toBe(false);
    });

    it('should handle API errors with skip fallback', async () => {
      const configWithSkip = { ...defaultConfig, fallbackOnError: 'skip' as const };
      const middlewareWithSkip = new ImageDescriptionMiddleware('test', configWithSkip);
      await middlewareWithSkip.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockRejectedValueOnce(new Error('AI API error: 500 Internal Server Error - Server error'));

      await middlewareWithSkip.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.skip).toBe(true);
    });

    it('should handle API errors with use_filename fallback', async () => {
      const configWithFilename = { ...defaultConfig, fallbackOnError: 'use_filename' as const };
      const middlewareWithFilename = new ImageDescriptionMiddleware('test', configWithFilename);
      await middlewareWithFilename.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockRejectedValueOnce(new Error('AI API error: 500 Internal Server Error - Server error'));

      await middlewareWithFilename.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('Image: test.png');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip large images', async () => {
      const configWithSmallLimit = { ...defaultConfig, maxImageSize: 50 };
      const middlewareWithLimit = new ImageDescriptionMiddleware('test', configWithSmallLimit);
      await middlewareWithLimit.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      await middlewareWithLimit.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('should filter unsupported image formats', async () => {
      const unsupportedAttachment = {
        data: 'data',
        mimeType: 'image/bmp',
        filename: 'test.bmp'
      };
      mockContext.message.attachments = [unsupportedAttachment];
      
      await middleware.execute(mockContext, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockedFetch).not.toHaveBeenCalled();
    });
  });

  describe('different AI providers', () => {
    beforeEach(async () => {
      await middleware.initialize(logger, telemetry);
    });

    it('should work with OpenAI provider', async () => {
      const openaiConfig = { ...defaultConfig, provider: 'openai' as const };
      const openaiMiddleware = new ImageDescriptionMiddleware('test', openaiConfig);
      await openaiMiddleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'OpenAI description' },
            finish_reason: 'stop'
          }]
        })
      } as Response);

      await openaiMiddleware.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('OpenAI description');
    });

    it('should work with Anthropic provider', async () => {
      const anthropicConfig = { ...defaultConfig, provider: 'anthropic' as const };
      const anthropicMiddleware = new ImageDescriptionMiddleware('test', anthropicConfig);
      await anthropicMiddleware.initialize(logger, telemetry);

      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Anthropic description' },
            finish_reason: 'stop'
          }]
        })
      } as Response);

      await anthropicMiddleware.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('Anthropic description');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await middleware.initialize(logger, telemetry);
      
      // Should not throw
      await middleware.cleanup();
    });
  });

  describe('retry logic', () => {
    beforeEach(async () => {
      const retryConfig = { ...defaultConfig, retry: { enabled: true, maxAttempts: 2, initialDelay: 1 } };
      const retryMiddleware = new ImageDescriptionMiddleware('test', retryConfig);
      await retryMiddleware.initialize(logger, telemetry);
      
      middleware = retryMiddleware;
    });

    it('should retry on timeout errors', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch
        .mockRejectedValueOnce(new Error('TimeoutError: The operation timed out.'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Retry success description' },
              finish_reason: 'stop'
            }]
          })
        } as Response);

      await middleware.execute(mockContext, mockNext);
      
      expect(mockContext.message.attachments[0].description).toBe('Retry success description');
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockRejectedValue(new Error('AI API error: 401 Unauthorized - Invalid API key'));

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect maxAttempts limit', async () => {
      mockContext.message.attachments = [{ ...sampleImageAttachment }];
      
      mockedFetch.mockRejectedValue(new Error('AI API error: 500 Internal Server Error - Server error'));

      await middleware.execute(mockContext, mockNext);
      
      expect(mockedFetch).toHaveBeenCalledTimes(2); // maxAttempts = 2
    });
  });
});
