import { YouTubeCaptionMiddleware, YouTubeCaptionConfig } from '../../services/middleware/builtin/YouTubeCaptionMiddleware';
import { MessageMiddlewareContext } from '../../services/middleware/types';
import { TestHelpers } from '../utils/testHelpers';

// Mock youtube-caption-extractor
jest.mock('youtube-caption-extractor', () => ({
  getSubtitles: jest.fn()
}));

describe('YouTubeCaptionMiddleware', () => {
  let middleware: YouTubeCaptionMiddleware;
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
    
    const config: YouTubeCaptionConfig = {
      mode: 'append',
      separator: '\n\n---\n\n'
    };
    
    middleware = new YouTubeCaptionMiddleware('test-youtube-caption', config);
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
        'Initialized YouTubeCaptionMiddleware: test-youtube-caption with mode: append'
      );
    });
  });

  describe('YouTube video ID extraction', () => {
    it('should extract video ID from standard YouTube URL', async () => {
      mockContext.message.text = 'Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([
        { text: 'Hello world' },
        { text: 'This is a test' }
      ]);

      await middleware.initialize(mockLogger, mockTelemetry);
      await middleware.execute(mockContext, mockNext);

      expect(getSubtitles).toHaveBeenCalledWith({
        videoID: 'dQw4w9WgXcQ',
        lang: 'auto'
      });
    });

    it('should extract video ID from youtu.be URL', async () => {
      mockContext.message.text = 'Short link: https://youtu.be/dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'Test caption' }]);

      await middleware.initialize(mockLogger, mockTelemetry);
      await middleware.execute(mockContext, mockNext);

      expect(getSubtitles).toHaveBeenCalledWith({
        videoID: 'dQw4w9WgXcQ',
        lang: 'auto'
      });
    });

    it('should extract video ID from YouTube shorts URL', async () => {
      mockContext.message.text = 'YouTube Short: https://www.youtube.com/shorts/dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'Short caption' }]);

      await middleware.initialize(mockLogger, mockTelemetry);
      await middleware.execute(mockContext, mockNext);

      expect(getSubtitles).toHaveBeenCalledWith({
        videoID: 'dQw4w9WgXcQ',
        lang: 'auto'
      });
    });

    it('should continue without captions if no YouTube URL found', async () => {
      mockContext.message.text = 'This is just a regular message without YouTube links';
      
      await middleware.initialize(mockLogger, mockTelemetry);
      await middleware.execute(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.message.text).toBe('This is just a regular message without YouTube links');
    });
  });

  describe('caption processing', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should process captions correctly - remove timestamps and newlines, add newlines before >>', async () => {
      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([
        { text: '[00:00:01] Hello world\nThis is a test' },
        { text: '(00:00:05) >> Next section here' },
        { text: '00:10 Final part >> End of video' }
      ]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.message.text).toContain('Hello world This is a test');
      expect(mockContext.message.text).toContain('\n>> Next section here');
      expect(mockContext.message.text).toContain('\n>> End of video');
      expect(mockContext.message.text).not.toContain('[00:00:01]');
      expect(mockContext.message.text).not.toContain('(00:00:05)');
      expect(mockContext.message.text).not.toContain('00:10');
    });

    it('should append captions by default', async () => {
      const originalText = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      mockContext.message.text = originalText;
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'Test caption content' }]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.message.text).toBe(originalText + '\n\n---\n\nTest caption content');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should replace message when mode is replace', async () => {
      const config: YouTubeCaptionConfig = { mode: 'replace' };
      middleware = new YouTubeCaptionMiddleware('test-replace', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'Replacement caption' }]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.message.text).toBe('Replacement caption');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prepend captions when mode is prepend', async () => {
      const config: YouTubeCaptionConfig = { mode: 'prepend', separator: '\n---\n' };
      middleware = new YouTubeCaptionMiddleware('test-prepend', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      const originalText = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      mockContext.message.text = originalText;
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'Prepended caption' }]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.message.text).toBe('Prepended caption\n---\n' + originalText);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should continue with original message if caption fetch fails', async () => {
      const originalText = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      mockContext.message.text = originalText;
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockRejectedValue(new Error('Network error'));

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.message.text).toBe(originalText);
      expect(mockNext).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip message if skipOnNoCaptions is true and captions fail', async () => {
      const config: YouTubeCaptionConfig = { 
        mode: 'append',
        skipOnNoCaptions: true,
        skipReason: 'Custom skip reason'
      };
      middleware = new YouTubeCaptionMiddleware('test-skip', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockRejectedValue(new Error('No captions available'));

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.skipReason).toBe('Custom skip reason');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip message if no captions found and skipOnNoCaptions is true', async () => {
      const config: YouTubeCaptionConfig = { 
        mode: 'append',
        skipOnNoCaptions: true
      };
      middleware = new YouTubeCaptionMiddleware('test-skip-no-captions', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.skip).toBe(true);
      expect(mockContext.skipReason).toContain('No captions found for YouTube video');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('configuration options', () => {
    it('should respect maxLength configuration', async () => {
      const config: YouTubeCaptionConfig = { 
        mode: 'replace',
        maxLength: 20
      };
      middleware = new YouTubeCaptionMiddleware('test-max-length', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'This is a very long caption that should be truncated' }]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.message.text.length).toBeLessThanOrEqual(20);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use custom language when specified', async () => {
      const config: YouTubeCaptionConfig = { 
        mode: 'append',
        language: 'de'
      };
      middleware = new YouTubeCaptionMiddleware('test-language', config);
      await middleware.initialize(mockLogger, mockTelemetry);

      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'German caption' }]);

      await middleware.execute(mockContext, mockNext);

      expect(getSubtitles).toHaveBeenCalledWith({
        videoID: 'dQw4w9WgXcQ',
        lang: 'de'
      });
    });
  });

  describe('metadata storage', () => {
    beforeEach(async () => {
      await middleware.initialize(mockLogger, mockTelemetry);
    });

    it('should store metadata in context data', async () => {
      mockContext.message.text = 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      
      const { getSubtitles } = require('youtube-caption-extractor');
      getSubtitles.mockResolvedValue([{ text: 'Test caption for metadata' }]);

      await middleware.execute(mockContext, mockNext);

      expect(mockContext.data['test-youtube-caption_video_id']).toBe('dQw4w9WgXcQ');
      expect(mockContext.data['test-youtube-caption_captions_length']).toBeGreaterThan(0);
      expect(mockContext.data['test-youtube-caption_original_text']).toBe('Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  });
});