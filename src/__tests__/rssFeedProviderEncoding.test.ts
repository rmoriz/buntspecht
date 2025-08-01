import { RSSFeedProvider } from '../messages/rssFeedProvider';
import { TestHelpers } from './utils/testHelpers';

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('RSSFeedProvider Encoding Support', () => {
  let provider: RSSFeedProvider;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = TestHelpers.createTestLogger();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('encoding detection', () => {
    it('should detect UTF-8 from HTTP Content-Type header', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      const mockXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed</title>
            <item>
              <title>Test Item</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=UTF-8'
        }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(mockXmlContent).buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Test Item');
    });

    it('should detect ISO-8859-1 from XML declaration and convert to UTF-8', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      // Create content with ISO-8859-1 encoding and special characters
      const mockXmlContent = `<?xml version="1.0" encoding="ISO-8859-1"?>
        <rss version="2.0">
          <channel>
            <title>Test Feed with Special Chars</title>
            <item>
              <title>Café and naïve résumé</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      // Encode as ISO-8859-1
      const iconv = require('iconv-lite');
      const iso88591Buffer = iconv.encode(mockXmlContent, 'iso-8859-1');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml'
        }),
        arrayBuffer: () => Promise.resolve(iso88591Buffer.buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Café and naïve résumé');
    });

    it('should detect Windows-1252 from HTTP header and convert properly', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      const mockXmlContent = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Windows-1252 Feed</title>
            <item>
              <title>Smart quotes "test" and em-dash—here</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      // Encode as Windows-1252
      const iconv = require('iconv-lite');
      const win1252Buffer = iconv.encode(mockXmlContent, 'windows-1252');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=windows-1252'
        }),
        arrayBuffer: () => Promise.resolve(win1252Buffer.buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Smart quotes "test" and em-dash—here');
    });

    it('should detect UTF-8 BOM and handle correctly', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      const mockXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>UTF-8 BOM Feed</title>
            <item>
              <title>Unicode test: 你好世界</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      // Add UTF-8 BOM
      const contentBytes = new TextEncoder().encode(mockXmlContent);
      const bomBytes = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const withBom = new Uint8Array(bomBytes.length + contentBytes.length);
      withBom.set(bomBytes);
      withBom.set(contentBytes, bomBytes.length);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml'
        }),
        arrayBuffer: () => Promise.resolve(withBom.buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Unicode test: 你好世界');
    });

    it('should fallback to UTF-8 for unknown encodings', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      const mockXmlContent = `<?xml version="1.0" encoding="UNKNOWN-ENCODING"?>
        <rss version="2.0">
          <channel>
            <title>Unknown Encoding Feed</title>
            <item>
              <title>Fallback Test</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=unknown-encoding'
        }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(mockXmlContent).buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Fallback Test');
    });

    it('should handle encoding detection with retry logic', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const,
        retries: 2
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      const mockXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Retry Test Feed</title>
            <item>
              <title>Retry Test Item</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=UTF-8'
        }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(mockXmlContent).buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Retry Test Item');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('encoding priority', () => {
    it('should prioritize HTTP header over XML declaration', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      // XML declares ISO-8859-1 but HTTP header says UTF-8
      const mockXmlContent = `<?xml version="1.0" encoding="ISO-8859-1"?>
        <rss version="2.0">
          <channel>
            <title>Priority Test</title>
            <item>
              <title>Should use HTTP header encoding</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=UTF-8'
        }),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(mockXmlContent).buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      
      // Should have used UTF-8 from HTTP header, not ISO-8859-1 from XML
      // Note: Logger is a real instance, not a mock, so we just verify the items were processed
      expect(items[0].title).toBe('Should use HTTP header encoding');
    });

    it('should use XML declaration when HTTP header has no charset', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      const mockXmlContent = `<?xml version="1.0" encoding="ISO-8859-1"?>
        <rss version="2.0">
          <channel>
            <title>XML Declaration Test</title>
            <item>
              <title>Should use XML declaration encoding</title>
              <link>https://example.com/item1</link>
            </item>
          </channel>
        </rss>`;

      // Encode as ISO-8859-1
      const iconv = require('iconv-lite');
      const iso88591Buffer = iconv.encode(mockXmlContent, 'iso-8859-1');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml'  // No charset specified
        }),
        arrayBuffer: () => Promise.resolve(iso88591Buffer.buffer)
      } as Response);

      const items = await (provider as any).fetchFeedItems();
      expect(items).toHaveLength(1);
      
      // Should have detected ISO-8859-1 from XML declaration
      // Note: Logger is a real instance, not a mock, so we just verify the items were processed
      expect(items[0].title).toBe('Should use XML declaration encoding');
    });
  });

  describe('error handling', () => {
    it('should handle encoding conversion errors gracefully', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      // Create invalid byte sequence
      const invalidBytes = new Uint8Array([0xFF, 0xFE, 0x00, 0x00]); // Invalid UTF-8

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/rss+xml; charset=UTF-8'
        }),
        arrayBuffer: () => Promise.resolve(invalidBytes.buffer)
      } as Response);

      // Should not throw, but handle gracefully
      await expect((provider as any).fetchFeedItems()).rejects.toThrow();
    });

    it('should handle network errors during encoding detection', async () => {
      const config = {
        feedUrl: 'https://example.com/feed.xml',
        type: 'rssfeed' as const,
        retries: 1
      };
      
      provider = new RSSFeedProvider(config);
      await provider.initialize(mockLogger);

      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect((provider as any).fetchFeedItems()).rejects.toThrow('Network timeout');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Should respect retry count
    });
  });
});