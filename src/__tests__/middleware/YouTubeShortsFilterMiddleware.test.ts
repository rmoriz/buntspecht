import { YouTubeShortsFilterMiddleware, YouTubeShortsFilterConfig } from '../../services/middleware/builtin/YouTubeShortsFilterMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { TestHelpers } from '../utils/testHelpers';

describe('YouTubeShortsFilterMiddleware', () => {
  let middleware: YouTubeShortsFilterMiddleware;
  let mockLogger: any;
  let mockTelemetry: any;
  let mockContext: MessageMiddlewareContext;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    mockTelemetry = TestHelpers.createMockTelemetry();
    mockNext = jest.fn();
    
    const config: YouTubeShortsFilterConfig = {
      skipShorts: true,
      logSkipped: true
    };
    
    middleware = new YouTubeShortsFilterMiddleware('test-shorts-filter', config);
    mockContext = {
      message: { text: '' },
      providerName: 'test-provider',
      providerConfig: { 
        name: 'test', 
        type: 'rssfeed', 
        enabled: true, 
        accounts: ['test-account'],
        config: {} 
      },
      accountNames: ['test-account'],
      visibility: 'public' as const,
      data: {},
      logger: mockLogger,
      telemetry: mockTelemetry,
      startTime: Date.now(),
      skip: false
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Initialized YouTubeShortsFilterMiddleware: test-shorts-filter (skipShorts: true)'
      );
    });

    it('should use default configuration', () => {
      const defaultMiddleware = new YouTubeShortsFilterMiddleware('default-test');
      expect(defaultMiddleware.enabled).toBe(true);
    });
  });

  describe('YouTube Shorts detection', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should detect standard YouTube Shorts URL', async () => {
      mockContext.message.text = 'Check out this short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.skipReason).toBe('YouTube Shorts werden übersprungen');
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should detect mobile YouTube Shorts URL', async () => {
      mockContext.message.text = 'Mobile short: https://m.youtube.com/shorts/abc123defgh';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should detect YouTube Shorts URL with parameters', async () => {
      mockContext.message.text = 'Short with params: https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should detect "shorts" keyword near YouTube URL', async () => {
      mockContext.message.text = 'New YouTube shorts video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow regular YouTube videos', async () => {
      mockContext.message.text = 'Regular video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(false);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(false);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow non-YouTube content', async () => {
      mockContext.message.text = 'This is just a regular message without any YouTube links';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(false);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(false);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle empty or null text', async () => {
      mockContext.message.text = '';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(false);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(false);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('configuration options', () => {
    it('should not skip shorts when skipShorts is false', async () => {
      const config: YouTubeShortsFilterConfig = { skipShorts: false };
      middleware = new YouTubeShortsFilterMiddleware('no-skip-test', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'YouTube short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(false);
      expect(mockContext.data['no-skip-test_shorts_detected']).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use custom skip reason', async () => {
      const config: YouTubeShortsFilterConfig = { 
        skipShorts: true,
        skipReason: 'Custom reason for skipping shorts'
      };
      middleware = new YouTubeShortsFilterMiddleware('custom-reason-test', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'YouTube short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.skipReason).toBe('Custom reason for skipping shorts');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should not log when logSkipped is false', async () => {
      const config: YouTubeShortsFilterConfig = { 
        skipShorts: true,
        logSkipped: false
      };
      middleware = new YouTubeShortsFilterMiddleware('no-log-test', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'YouTube short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should log when logSkipped is true (default)', async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
      mockContext.message.text = 'YouTube short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'YouTubeShortsFilterMiddleware test-shorts-filter: Skipped message containing YouTube Shorts'
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should continue on error and call next middleware', async () => {
      // Mock an error by making the message text a non-string
      mockContext.message = { text: null as any };
      
      await middleware.execute(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should log errors', async () => {
      // Force an error by mocking a method to throw
      const originalContainsShorts = (middleware as any).containsYouTubeShorts;
      (middleware as any).containsYouTubeShorts = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      mockContext.message.text = 'Test message';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'YouTubeShortsFilterMiddleware test-shorts-filter failed:',
        expect.any(Error)
      );
      expect(mockNext).toHaveBeenCalled();

      // Restore original method
      (middleware as any).containsYouTubeShorts = originalContainsShorts;
    });
  });

  describe('metadata storage', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should store metadata when shorts are detected and skipped', async () => {
      const originalText = 'YouTube short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      mockContext.message.text = originalText;
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockContext.data['test-shorts-filter_original_text']).toBe(originalText);
    });

    it('should store detection status when shorts are detected but not skipped', async () => {
      const config: YouTubeShortsFilterConfig = { skipShorts: false };
      middleware = new YouTubeShortsFilterMiddleware('no-skip-metadata-test', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'YouTube short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.data['no-skip-metadata-test_shorts_detected']).toBe(true);
      expect(mockContext.data['no-skip-metadata-test_original_text']).toBeUndefined();
    });

    it('should store false detection status for regular content', async () => {
      mockContext.message.text = 'Regular YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(false);
      expect(mockContext.data['test-shorts-filter_original_text']).toBeUndefined();
    });
  });

  describe('complex URL patterns', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should detect shorts in mixed content', async () => {
      mockContext.message.text = 'Check out my latest content: Regular video: https://www.youtube.com/watch?v=dQw4w9WgXcQ And this short: https://www.youtube.com/shorts/abc123defgh More text here...';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive detection', async () => {
      mockContext.message.text = 'NEW YOUTUBE SHORTS: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(true);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should not trigger on unrelated "shorts" mentions', async () => {
      mockContext.message.text = 'I bought new shorts today. Much later in the text here is a video: https://www.youtube.com/watch?v=dQw4w9WgXcQ but it is not related to the shorts I bought earlier.';
      
      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(false);
      expect(mockContext.data['test-shorts-filter_shorts_detected']).toBe(false);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});