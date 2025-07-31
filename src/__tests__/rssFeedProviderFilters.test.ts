import { RSSFeedProvider, RSSFeedProviderConfig } from '../messages/rssFeedProvider';
import { TestHelpers } from './utils/testHelpers';

// Mock rss-parser
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn()
  }));
});

describe('RSSFeedProvider Filters', () => {
  let provider: RSSFeedProvider;
  let mockLogger: any;
  let mockTelemetry: any;

  const createMockFeedItems = () => [
    {
      title: 'Regular YouTube Video',
      link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      content: 'This is a regular video about technology',
      pubDate: '2024-01-01T10:00:00Z'
    },
    {
      title: 'YouTube Shorts Video',
      link: 'https://www.youtube.com/shorts/abc123defgh',
      content: 'Quick tip in short format',
      pubDate: '2024-01-01T11:00:00Z'
    },
    {
      title: 'Live Stream Event',
      link: 'https://www.youtube.com/watch?v=live123456',
      content: 'Join us for a live coding session',
      pubDate: '2024-01-01T12:00:00Z'
    },
    {
      title: 'Tutorial: Advanced JavaScript',
      link: 'https://www.youtube.com/watch?v=tutorial123',
      content: 'Learn advanced JavaScript concepts',
      pubDate: '2024-01-01T13:00:00Z'
    },
    {
      title: 'Non-YouTube Content',
      link: 'https://example.com/blog-post',
      content: 'This is a blog post about programming',
      pubDate: '2024-01-01T14:00:00Z'
    }
  ];

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    mockTelemetry = TestHelpers.createMockTelemetry();
    jest.clearAllMocks();
  });

  describe('Preset Filters', () => {
    it('should exclude YouTube Shorts when excludeYouTubeShorts is enabled', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          presets: {
            excludeYouTubeShorts: true
          }
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(4); // Should exclude the shorts video
      expect(filteredItems.find((item: any) => item.link.includes('/shorts/'))).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Excluded YouTube Shorts')
      );
    });

    it('should exclude YouTube Live streams when excludeYouTubeLive is enabled', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          presets: {
            excludeYouTubeLive: true
          }
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(4); // Should exclude the live stream
      expect(filteredItems.find((item: any) => item.title.includes('Live'))).toBeUndefined();
    });

    it('should include only YouTube videos when includeOnlyYouTubeVideos is enabled', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          presets: {
            includeOnlyYouTubeVideos: true
          }
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(2); // Only YouTube watch URLs (excludes shorts and live)
      expect(filteredItems.every((item: any) => 
        item.link.includes('youtube.com/watch?v=') || item.link.includes('youtu.be/')
      )).toBe(true);
    });
  });

  describe('Title Filters', () => {
    it('should include only items with matching titles', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['Tutorial', 'JavaScript']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(1); // Only the tutorial item
      expect(filteredItems[0].title).toContain('Tutorial');
    });

    it('should exclude items with matching titles', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleExclude: ['Shorts', 'Live']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(3); // Exclude shorts and live
      expect(filteredItems.find((item: any) => item.title.includes('Shorts'))).toBeUndefined();
      expect(filteredItems.find((item: any) => item.title.includes('Live'))).toBeUndefined();
    });

    it('should support regex patterns in title filters', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['^Tutorial:.*JavaScript$'],
          useRegex: true
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0].title).toBe('Tutorial: Advanced JavaScript');
    });
  });

  describe('Link Filters', () => {
    it('should include only items with matching links', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          linkInclude: ['youtube.com/watch']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(3); // Regular YouTube videos only
      expect(filteredItems.every((item: any) => item.link.includes('youtube.com/watch'))).toBe(true);
    });

    it('should exclude items with matching links', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          linkExclude: ['/shorts/', 'example.com']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(3); // Exclude shorts and example.com
      expect(filteredItems.find((item: any) => item.link.includes('/shorts/'))).toBeUndefined();
      expect(filteredItems.find((item: any) => item.link.includes('example.com'))).toBeUndefined();
    });
  });

  describe('Content Filters', () => {
    it('should include only items with matching content', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          contentInclude: ['JavaScript', 'programming']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(2); // JavaScript tutorial and blog post
    });

    it('should exclude items with matching content', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          contentExclude: ['live coding', 'short format']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(3); // Exclude live and shorts content
    });
  });

  describe('Case Sensitivity', () => {
    it('should respect case sensitivity when enabled', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['tutorial'], // lowercase
          caseSensitive: true
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(0); // 'Tutorial' (capital T) should not match 'tutorial'
    });

    it('should ignore case when case sensitivity is disabled', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['tutorial'], // lowercase
          caseSensitive: false
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(1); // 'Tutorial' should match 'tutorial'
    });
  });

  describe('Combined Filters', () => {
    it('should apply multiple filter types together', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          presets: {
            excludeYouTubeShorts: true
          },
          titleExclude: ['Live'],
          linkInclude: ['youtube.com']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(filteredItems).toHaveLength(2); // Only regular YouTube videos, no shorts, no live
      expect(filteredItems.every((item: any) => item.link.includes('youtube.com'))).toBe(true);
      expect(filteredItems.find((item: any) => item.link.includes('/shorts/'))).toBeUndefined();
      expect(filteredItems.find((item: any) => item.title.includes('Live'))).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid regex patterns gracefully', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['[invalid regex'],
          useRegex: true
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      const filteredItems = (provider as any).applyFilters(mockItems);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid regex pattern')
      );
      // Should fallback to string contains
      expect(filteredItems).toHaveLength(0); // No items contain '[invalid regex'
    });

    it('should handle empty or null items gracefully', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['test']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = [null, undefined, {}, ...createMockFeedItems()];
      const filteredItems = (provider as any).applyFilters(mockItems);

      // Should filter out null/undefined/empty items and apply filters to valid ones
      // Since titleInclude: ['test'] is specified, no items will match
      expect(filteredItems).toHaveLength(0); // No items contain 'test' in title
      // But the function should handle null/undefined items gracefully without errors
    });
  });

  describe('Logging', () => {
    it('should log filter statistics', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        filters: {
          titleInclude: ['Tutorial']
        }
      };

      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry, 'test-provider');

      const mockItems = createMockFeedItems();
      (provider as any).applyFilters(mockItems);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('RSS filters removed 4 items, 1 items remaining')
      );
    });
  });
});