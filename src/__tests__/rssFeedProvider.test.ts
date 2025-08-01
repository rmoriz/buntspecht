import { RSSFeedProvider, RSSFeedProviderConfig } from '../messages/rssFeedProvider';
import { TestHelpers } from './utils/testHelpers';

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Sample XML content for testing
const sampleXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>Test Description</description>
    <item>
      <title>Test Item 1</title>
      <link>https://example.com/item1</link>
      <pubDate>Mon, 01 Jan 2023 00:00:00 GMT</pubDate>
      <description>Test content 1</description>
    </item>
    <item>
      <title>Test Item 2</title>
      <link>https://example.com/item2</link>
      <pubDate>Tue, 02 Jan 2023 00:00:00 GMT</pubDate>
      <description>Test content 2</description>
    </item>
  </channel>
</rss>`;

describe('RSSFeedProvider', () => {
  let provider: RSSFeedProvider;
  let mockLogger: any;
  let mockTelemetry: any;

  beforeEach(() => {
    mockLogger = TestHelpers.createTestLogger();
    mockTelemetry = TestHelpers.createMockTelemetry();
    
    // Reset fetch mock
    mockFetch.mockClear();
    
    // Setup default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'application/rss+xml; charset=UTF-8'
      }),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(sampleXmlContent).buffer)
    } as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with valid config', () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed'
      };
      
      provider = new RSSFeedProvider(config);
      expect(provider).toBeDefined();
      expect(provider.getProviderName()).toBe('rssfeed');
    });

    it('should throw error for missing feedUrl', () => {
      expect(() => {
        new RSSFeedProvider({} as RSSFeedProviderConfig);
      }).toThrow('feedUrl is required');
    });

    it('should throw error for invalid feedUrl', () => {
      expect(() => {
        new RSSFeedProvider({
          feedUrl: 'not-a-url',
          type: 'rssfeed'
        });
      }).toThrow('feedUrl must be a valid HTTP/HTTPS URL');
    });

    it('should accept valid HTTP URL', () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'http://example.com/feed.xml',
        type: 'rssfeed'
      };
      
      provider = new RSSFeedProvider(config);
      expect(provider).toBeDefined();
    });

    it('should accept valid HTTPS URL', () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed'
      };
      
      provider = new RSSFeedProvider(config);
      expect(provider).toBeDefined();
    });
  });

  describe('initialization', () => {
    beforeEach(() => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed'
      };
      provider = new RSSFeedProvider(config);
    });

    it('should initialize successfully', async () => {
      await provider.initialize(mockLogger, mockTelemetry);
      
      expect(provider.getProviderName()).toBe('rssfeed');
    });

    it('should initialize with custom provider name', async () => {
      await provider.initialize(mockLogger, mockTelemetry, 'custom-rss');
      
      expect(provider.getProviderName()).toBe('custom-rss');
    });
  });

  describe('message generation', () => {
    beforeEach(async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        cache: { enabled: false } // Disable caching for tests
      };
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);
    });

    it('should generate message from RSS feed', async () => {
      const message = await provider.generateMessage();
      
      expect(message).toContain('Test Item 1');
      expect(message).toContain('https://example.com/item1');
      expect(message).toContain('Test content 1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Buntspecht RSS Reader/1.0'
          })
        })
      );
    });

    it('should generate message with attachments', async () => {
      const messageWithAttachments = await provider.generateMessageWithAttachments();
      
      expect(messageWithAttachments.text).toContain('Test Item 1');
      expect(messageWithAttachments.text).toContain('https://example.com/item1');
      expect(messageWithAttachments.text).toContain('Test content 1');
    });

    it('should return empty string when no items', async () => {
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Empty Feed</title>
            <description>No items</description>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=UTF-8'
        }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(emptyXml).buffer)
      } as Response);
      
      const message = await provider.generateMessage();
      expect(message).toBe('');
    });

    it('should handle template formatting', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        template: '📰 {{title}}\n{{link}}',
        cache: { enabled: false }
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);
      
      const message = await provider.generateMessage();
      expect(message).toBe('📰 Test Item 1\nhttps://example.com/item1');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        retries: 2,
        cache: { enabled: false }
      };
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);
    });

    it('should retry on network failure', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'content-type': 'application/rss+xml; charset=UTF-8'
          }),
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(sampleXmlContent).buffer)
        } as Response);

      const message = await provider.generateMessage();
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(message).toContain('Test Item 1');
    });

    it('should throw error after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(provider.generateMessage()).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      await expect(provider.generateMessage()).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('caching behavior', () => {
    beforeEach(async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        cache: {
          enabled: true,
          filePath: './test-cache/rss-test.json'
        }
      };
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);
    });

    it('should warm cache', async () => {
      await provider.warmCache();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Buntspecht RSS Reader/1.0'
          })
        })
      );
    });
  });

  describe('encoding support integration', () => {
    beforeEach(async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        cache: { enabled: false }
      };
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);
    });

    it('should handle UTF-8 encoding', async () => {
      const message = await provider.generateMessage();
      
      expect(mockFetch).toHaveBeenCalled();
      expect(message).toContain('Test Item 1');
    });

    it('should handle ISO-8859-1 encoding', async () => {
      const isoContent = `<?xml version="1.0" encoding="ISO-8859-1"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Café and naïve résumé</title>
              <link>https://example.com/item1</link>
              <description>Special characters test</description>
            </item>
          </channel>
        </rss>`;

      const iconv = require('iconv-lite');
      const isoBuffer = iconv.encode(isoContent, 'iso-8859-1');

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml'
        }),
        arrayBuffer: () => Promise.resolve(isoBuffer.buffer)
      } as Response);

      const message = await provider.generateMessage();
      expect(message).toContain('Café and naïve résumé');
    });

    it('should handle Windows-1252 encoding', async () => {
      const win1252Content = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Windows-1252 Feed</title>
            <item>
              <title>Smart quotes "test" and em-dash—here</title>
              <link>https://example.com/item1</link>
              <description>Windows-1252 characters</description>
            </item>
          </channel>
        </rss>`;

      const iconv = require('iconv-lite');
      const win1252Buffer = iconv.encode(win1252Content, 'windows-1252');

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=windows-1252'
        }),
        arrayBuffer: () => Promise.resolve(win1252Buffer.buffer)
      } as Response);

      const message = await provider.generateMessage();
      expect(message).toContain('Smart quotes "test" and em-dash—here');
    });
  });

  describe('configuration options', () => {
    it('should respect timeout setting', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        timeout: 5000,
        cache: { enabled: false }
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);

      // Mock a slow response
      mockFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          headers: new Headers({
            'content-type': 'application/rss+xml; charset=UTF-8'
          }),
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode(sampleXmlContent).buffer)
        } as Response), 100))
      );

      const message = await provider.generateMessage();
      expect(message).toContain('Test Item 1');
    });

    it('should respect custom user agent', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        userAgent: 'Custom Bot/1.0',
        cache: { enabled: false }
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);

      await provider.generateMessage();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Custom Bot/1.0'
          })
        })
      );
    });

    it('should respect maxItems setting', async () => {
      const config: RSSFeedProviderConfig = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed',
        maxItems: 1,
        cache: { enabled: false }
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger, mockTelemetry);

      const message = await provider.generateMessage();
      expect(message).toContain('Test Item 1');
      // Should only process the first item due to maxItems: 1
    });
  });
});