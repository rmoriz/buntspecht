import { RSSFeedProvider, RSSFeedProviderConfig } from '../messages/rssFeedProvider';
import { Logger } from '../utils/logger';

const sampleFeed = {
  items: [
    { title: 'A', link: 'https://test/a', pubDate: '2021-01-01', description: 'Test A' },
    { title: 'B', link: 'https://test/b', pubDate: '2021-01-02', description: 'Test B' },
    { title: 'C', link: 'https://test/c', isoDate: '2021-01-03T10:00:00Z', contentSnippet: 'Test C snippet' },
    { title: 'D', link: 'https://test/d', id: 'item-d', content: 'Test D content' },
  ]
};

const atomFeed = {
  items: [
    { title: 'Atom Entry', link: 'https://test/atom', isoDate: '2021-01-01T10:00:00Z', content: 'Atom content' },
  ]
};

const emptyFeed = { items: [] };

const mockParser = {
  parseURL: jest.fn().mockResolvedValue(sampleFeed),
};

jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => mockParser);
});

describe('RSSFeedProvider', () => {
  const config: RSSFeedProviderConfig = { feedUrl: 'https://rss.test/feed', cache: { enabled: false } };
  let provider: RSSFeedProvider;
  let logger: Logger;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockParser.parseURL.mockResolvedValue(sampleFeed);
    provider = new RSSFeedProvider(config);
    logger = new Logger();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    await provider.initialize(logger);
  });

  describe('Basic functionality', () => {
    it('fetches and formats latest item', async () => {
      const msg = await provider.generateMessage();
      expect(msg).toContain('A\n');
      expect(msg).toContain('https://test/a');
      expect(msg).toContain('Test A');
    });

    it('returns empty string when no items', async () => {
      mockParser.parseURL.mockResolvedValue(emptyFeed);
      const msg = await provider.generateMessage();
      expect(msg).toBe('');
    });

    it('only returns unprocessed items', async () => {
      const items = await provider['fetchFeedItems']();
      expect(items.length).toBe(sampleFeed.items.length);
      expect(items.some(i => i.title === 'A')).toBe(true);
    });

    it('limits items to 10', async () => {
      const largeFeed = {
        items: Array.from({ length: 15 }, (_, i) => ({
          title: `Item ${i}`,
          link: `https://test/${i}`,
          pubDate: `2021-01-${String(i + 1).padStart(2, '0')}`,
          description: `Test ${i}`
        }))
      };
      mockParser.parseURL.mockResolvedValue(largeFeed);
      const items = await provider['fetchFeedItems']();
      expect(items.length).toBe(10);
    });
  });

  describe('Content formatting', () => {
    it('formats RSS item with description', () => {
      const out = provider['formatItem'](sampleFeed.items[0]);
      expect(out).toContain('A');
      expect(out).toContain('https://test/a');
      expect(out).toContain('Test A');
    });

    it('formats item with contentSnippet', () => {
      const out = provider['formatItem'](sampleFeed.items[2]);
      expect(out).toContain('C');
      expect(out).toContain('https://test/c');
      expect(out).toContain('Test C snippet');
    });

    it('formats item with content', () => {
      const out = provider['formatItem'](sampleFeed.items[3]);
      expect(out).toContain('D');
      expect(out).toContain('https://test/d');
      expect(out).toContain('Test D content');
    });

    it('handles missing content gracefully', () => {
      const item = { title: 'No Content', link: 'https://test/no-content' };
      const out = provider['formatItem'](item);
      expect(out).toContain('No Content');
      expect(out).toContain('https://test/no-content');
      expect(out).toContain('');
    });
  });

  describe('Error handling', () => {
    it('throws error for missing feedUrl', () => {
      expect(() => new RSSFeedProvider({} as RSSFeedProviderConfig)).toThrow('feedUrl is required');
    });

    it('handles network errors gracefully', async () => {
      mockParser.parseURL.mockRejectedValue(new Error('Network error'));
      await expect(provider.generateMessage()).rejects.toThrow('Network error');
    });

    it('handles invalid feed format', async () => {
      mockParser.parseURL.mockResolvedValue({ items: null });
      const items = await provider['fetchFeedItems']();
      expect(items).toEqual([]);
    });

    it('handles malformed feed items', async () => {
      const malformedFeed = {
        items: [
          null,
          undefined,
          { title: 'Valid Item', link: 'https://test/valid', pubDate: '2021-01-01' },
          {} // No key, will be filtered out
        ]
      };
      mockParser.parseURL.mockResolvedValue(malformedFeed);
      const items = await provider['fetchFeedItems']();
      expect(items.length).toBe(1); // Only the valid item with a key should remain
      expect(items[0].title).toBe('Valid Item');
    });
  });

  describe('Caching', () => {
    it('warms cache without error', async () => {
      await expect(provider.warmCache()).resolves.not.toThrow();
    });

    it('handles cache warming with empty feed', async () => {
      mockParser.parseURL.mockResolvedValue(emptyFeed);
      await expect(provider.warmCache()).resolves.not.toThrow();
      expect(logger.info).toHaveBeenCalledWith('Cache warmed for RSSFeedProvider: 0 items added.');
    });

    it('respects cache disabled setting', async () => {
      const configWithoutCache = { feedUrl: 'https://test.com/feed', cache: { enabled: false } };
      const providerNoCache = new RSSFeedProvider(configWithoutCache);
      await providerNoCache.initialize(logger);
      
      const items = await providerNoCache['fetchFeedItems']();
      expect(items.length).toBe(sampleFeed.items.length);
    });

    it('prevents duplicate messages by marking items as processed', async () => {
      // Set up a single-item feed
      const singleItemFeed = {
        items: [
          { title: 'Single Item', link: 'https://test/single', pubDate: '2021-01-01', description: 'Only item' }
        ]
      };
      
      // Set the mock without clearing all mocks
      mockParser.parseURL.mockResolvedValue(singleItemFeed);
      
      const cachedConfig = { 
        feedUrl: 'https://test.com/feed', 
        cache: { enabled: true, filePath: './tmp_test_cache/test.json' } 
      };
      const cachedProvider = new RSSFeedProvider(cachedConfig);
      const testLogger = new Logger();
      jest.spyOn(testLogger, 'info').mockImplementation();
      jest.spyOn(testLogger, 'warn').mockImplementation();
      jest.spyOn(testLogger, 'error').mockImplementation();
      jest.spyOn(testLogger, 'debug').mockImplementation();
      await cachedProvider.initialize(testLogger);

      // First call should return a message
      const message1 = await cachedProvider.generateMessage();
      expect(message1).toContain('Single Item');
      expect(message1).toContain('https://test/single');

      // Second call should return empty string (item already processed)
      const message2 = await cachedProvider.generateMessage();
      expect(message2).toBe('');

      // Third call should also return empty string
      const message3 = await cachedProvider.generateMessage();
      expect(message3).toBe('');
      
      // Reset for other tests
      mockParser.parseURL.mockResolvedValue(sampleFeed);
    });

    it('prevents duplicate messages with generateMessageWithAttachments', async () => {
      // Set up a single-item feed
      const singleItemFeed = {
        items: [
          { title: 'Attachment Item', link: 'https://test/attachment', pubDate: '2021-01-01', description: 'Attachment test' }
        ]
      };
      
      // Set the mock without clearing all mocks
      mockParser.parseURL.mockResolvedValue(singleItemFeed);
      
      const cachedConfig = { 
        feedUrl: 'https://test.com/feed', 
        cache: { enabled: true, filePath: './tmp_test_cache/test2.json' } 
      };
      const cachedProvider = new RSSFeedProvider(cachedConfig);
      const testLogger = new Logger();
      jest.spyOn(testLogger, 'info').mockImplementation();
      jest.spyOn(testLogger, 'warn').mockImplementation();
      jest.spyOn(testLogger, 'error').mockImplementation();
      jest.spyOn(testLogger, 'debug').mockImplementation();
      await cachedProvider.initialize(testLogger);

      // First call should return a message
      const result1 = await cachedProvider.generateMessageWithAttachments();
      expect(result1.text).toContain('Attachment Item');
      expect(result1.text).toContain('https://test/attachment');

      // Second call should return empty text (item already processed)
      const result2 = await cachedProvider.generateMessageWithAttachments();
      expect(result2.text).toBe('');

      // Third call should also return empty text
      const result3 = await cachedProvider.generateMessageWithAttachments();
      expect(result3.text).toBe('');
      
      // Reset for other tests
      mockParser.parseURL.mockResolvedValue(sampleFeed);
    });
  });

  describe('Different feed formats', () => {
    it('handles Atom feeds with isoDate', async () => {
      mockParser.parseURL.mockResolvedValue(atomFeed);
      const msg = await provider.generateMessage();
      expect(msg).toContain('Atom Entry');
      expect(msg).toContain('https://test/atom');
      expect(msg).toContain('Atom content');
    });

    it('handles items with different date formats', () => {
      const items = [
        { title: 'RSS', pubDate: '2021-01-01' },
        { title: 'Atom', isoDate: '2021-01-02T10:00:00Z' },
        { title: 'ID only', id: 'unique-id' }
      ];
      
      items.forEach(item => {
        const formatted = provider['formatItem'](item);
        expect(formatted).toContain(item.title);
      });
    });
  });

  describe('Message with attachments', () => {
    it('returns message with attachments structure', async () => {
      const result = await provider.generateMessageWithAttachments();
      expect(result).toHaveProperty('text');
      expect(result.text).toContain('A');
      expect(result.text).toContain('https://test/a');
    });
  });

  describe('Configuration options', () => {
    it('validates URL format', () => {
      expect(() => new RSSFeedProvider({ feedUrl: 'invalid-url' })).toThrow('feedUrl must be a valid HTTP/HTTPS URL');
      expect(() => new RSSFeedProvider({ feedUrl: 'ftp://example.com/feed.xml' })).toThrow('feedUrl must be a valid HTTP/HTTPS URL');
      expect(() => new RSSFeedProvider({ feedUrl: 'https://example.com/feed.xml' })).not.toThrow();
    });

    it('applies default configuration values', () => {
      const provider = new RSSFeedProvider({ feedUrl: 'https://example.com/feed.xml' });
      expect(provider['config'].timeout).toBe(30000);
      expect(provider['config'].maxItems).toBe(10);
      expect(provider['config'].retries).toBe(3);
      expect(provider['config'].userAgent).toBe('Buntspecht RSS Reader/1.0');
    });

    it('respects custom configuration values', () => {
      const customConfig = {
        feedUrl: 'https://example.com/feed.xml',
        timeout: 15000,
        maxItems: 5,
        retries: 2,
        userAgent: 'Custom Bot/1.0'
      };
      const provider = new RSSFeedProvider(customConfig);
      expect(provider['config'].timeout).toBe(15000);
      expect(provider['config'].maxItems).toBe(5);
      expect(provider['config'].retries).toBe(2);
      expect(provider['config'].userAgent).toBe('Custom Bot/1.0');
    });

    it('respects maxItems configuration', async () => {
      const customProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        maxItems: 2,
        cache: { enabled: false }
      });
      await customProvider.initialize(logger);

      const items = await customProvider['fetchFeedItems']();
      expect(items.length).toBe(2);
    });
  });

  describe('Content cleaning', () => {
    it('removes HTML tags from content', () => {
      const itemWithHtml = {
        title: 'Test Article',
        link: 'https://test.com/article',
        description: '<p>This is <strong>bold</strong> text with <a href="#">links</a></p>'
      };
      const formatted = provider['formatItem'](itemWithHtml);
      expect(formatted).toContain('This is bold text with links');
      expect(formatted).not.toContain('<p>');
      expect(formatted).not.toContain('<strong>');
      expect(formatted).not.toContain('<a href="#">');
    });

    it('handles items with missing title gracefully', () => {
      const itemWithoutTitle = {
        link: 'https://test.com/no-title',
        description: 'Content without title'
      };
      const formatted = provider['formatItem'](itemWithoutTitle);
      expect(formatted).toContain('Untitled');
      expect(formatted).toContain('https://test.com/no-title');
      expect(formatted).toContain('Content without title');
    });
  });

  describe('Template functionality', () => {
    it('uses default formatting when no template is provided', () => {
      const item = {
        title: 'Test Title',
        link: 'https://test.com/link',
        description: 'Test description'
      };
      const formatted = provider['formatItem'](item);
      expect(formatted).toBe('Test Title\nhttps://test.com/link\nTest description');
    });

    it('formats items using custom template', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '📰 {{title}}\n🔗 {{link}}\n📝 {{content}}',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      const item = {
        title: 'Breaking News',
        link: 'https://news.com/breaking',
        contentSnippet: 'This is breaking news content'
      };

      const formatted = templateProvider['formatItem'](item);
      expect(formatted).toBe('📰 Breaking News\n🔗 https://news.com/breaking\n📝 This is breaking news content');
    });

    it('handles template with trim functions', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '{{title|trim:20}}: {{content|trim:50}}',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      const item = {
        title: 'This is a very long title that should be trimmed',
        link: 'https://test.com',
        description: 'This is a very long description that should definitely be trimmed because it exceeds the limit'
      };

      const formatted = templateProvider['formatItem'](item);
      expect(formatted).toContain('This is a very lo...');
      expect(formatted).toContain('This is a very long description that should def...');
    });

    it('provides access to all RSS item fields in template', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '{{title}} by {{author}} in {{categories}} ({{pubDate}})',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      const item = {
        title: 'Tech Article',
        author: 'John Doe',
        categories: ['Technology', 'Programming'],
        pubDate: '2023-01-01',
        link: 'https://test.com'
      };

      const formatted = templateProvider['formatItem'](item);
      expect(formatted).toBe('Tech Article by John Doe in Technology,Programming (2023-01-01)');
    });

    it('cleans HTML from template data', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '{{title}}: {{description}}',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      const item = {
        title: 'HTML Article',
        description: '<p>This has <strong>HTML</strong> tags</p>',
        link: 'https://test.com'
      };

      const formatted = templateProvider['formatItem'](item);
      expect(formatted).toBe('HTML Article: This has HTML tags');
      expect(formatted).not.toContain('<p>');
      expect(formatted).not.toContain('<strong>');
    });

    it('handles missing template variables gracefully', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '{{title}} - {{nonexistent}} - {{author}}',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      const item = {
        title: 'Test Article',
        link: 'https://test.com'
        // author is missing
      };

      const formatted = templateProvider['formatItem'](item);
      expect(formatted).toBe('Test Article - {{nonexistent}} - ');
    });

    it('uses content priority: contentSnippet > content > description', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '{{content}}',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      // Test contentSnippet priority
      const item1 = {
        title: 'Test',
        contentSnippet: 'Snippet content',
        content: 'Full content',
        description: 'Description content'
      };
      expect(templateProvider['formatItem'](item1)).toBe('Snippet content');

      // Test content fallback
      const item2 = {
        title: 'Test',
        content: 'Full content',
        description: 'Description content'
      };
      expect(templateProvider['formatItem'](item2)).toBe('Full content');

      // Test description fallback
      const item3 = {
        title: 'Test',
        description: 'Description content'
      };
      expect(templateProvider['formatItem'](item3)).toBe('Description content');
    });

    it('generates message with template', async () => {
      const templateProvider = new RSSFeedProvider({
        feedUrl: 'https://example.com/feed.xml',
        template: '🔥 {{title}}\n{{link}}',
        cache: { enabled: false }
      });
      await templateProvider.initialize(logger);

      mockParser.parseURL.mockResolvedValue(sampleFeed);
      const message = await templateProvider.generateMessage();
      expect(message).toContain('🔥 A');
      expect(message).toContain('https://test/a');
    });
  });
});
