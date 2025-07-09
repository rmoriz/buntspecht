import { BlueskyClient } from '../services/blueskyClient';
import type { TelemetryService } from '../services/telemetryInterface';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';

// Mock @atproto/api
jest.mock('@atproto/api', () => ({
  BskyAgent: jest.fn(),
}));

interface MockBskyAgent {
  login: jest.Mock;
  post: jest.Mock;
  getProfile: jest.Mock;
  session?: {
    accessJwt: string;
    refreshJwt: string;
    handle: string;
    did: string;
  };
}

describe('BlueskyClient', () => {
  let mockBskyAgent: MockBskyAgent;
  let config: BotConfig;
  let logger: Logger;
  let telemetry: TelemetryService;
  let client: BlueskyClient;

  beforeEach(async () => {
    // Create mock Bluesky agent
    mockBskyAgent = {
      login: jest.fn(),
      post: jest.fn(),
      getProfile: jest.fn(),
    };

    // Mock the BskyAgent constructor
    const { BskyAgent } = require('@atproto/api');
    BskyAgent.mockImplementation(() => mockBskyAgent);

    // Mock successful login by default
    mockBskyAgent.login.mockResolvedValue({});

    config = {
      accounts: [
        {
          name: 'test-bluesky',
          type: 'bluesky',
          instance: 'https://bsky.social',
          accessToken: '',
          identifier: 'test.bsky.social',
          password: 'test-app-password'
        }
      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['test-bluesky'],
            config: { message: 'TEST PING' }
          }
        ]
      },
      logging: { level: 'debug' }
    };

    logger = new Logger('debug');
    telemetry = {
      startSpan: jest.fn().mockReturnValue({
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn()
      }),
      recordPost: jest.fn(),
      recordError: jest.fn(),
      initialize: jest.fn(),
      shutdown: jest.fn()
    } as unknown as jest.Mocked<TelemetryService>;

    // Set up mock session
    mockBskyAgent.session = {
      accessJwt: 'mock-jwt',
      refreshJwt: 'mock-refresh',
      handle: 'test.bsky.social',
      did: 'did:plc:test'
    };

    client = new BlueskyClient(config, logger, telemetry);
    
    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize Bluesky agent for bluesky accounts', () => {
      const { BskyAgent } = require('@atproto/api');
      expect(BskyAgent).toHaveBeenCalledWith({
        service: 'https://bsky.social'
      });
      expect(mockBskyAgent.login).toHaveBeenCalledWith({
        identifier: 'test.bsky.social',
        password: 'test-app-password'
      });
    });

    it('should skip non-bluesky accounts', async () => {
      // Clear previous calls
      jest.clearAllMocks();
      
      const mastodonConfig = {
        ...config,
        accounts: [
          {
            name: 'mastodon-account',
            type: 'mastodon',
            instance: 'https://mastodon.social',
            accessToken: 'mastodon-token'
          }
        ]
      };

      new BlueskyClient(mastodonConfig, logger, telemetry);
      
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should not create any Bluesky agents for mastodon accounts
      expect(mockBskyAgent.login).not.toHaveBeenCalled();
    });

    it('should handle login errors gracefully', async () => {
      mockBskyAgent.login.mockRejectedValue(new Error('Login failed'));
      
      // Should not throw during construction
      expect(() => new BlueskyClient(config, logger, telemetry)).not.toThrow();
      
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  describe('postStatus', () => {
    beforeEach(() => {
      // Ensure client is properly initialized
      mockBskyAgent.post.mockResolvedValue({
        uri: 'at://did:plc:test/app.bsky.feed.post/test123',
        cid: 'test-cid'
      });

      // Mock fetch for URL metadata
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should post status successfully to Bluesky account without URLs', async () => {
      await client.postStatus('Test message', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Test message',
        createdAt: expect.any(String)
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should post status with external embed when URL is detected', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Test Page</title><meta name="description" content="Test description"></head></html>'),
      } as Response);

      await client.postStatus('Check this out: https://example.com', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Check this out:',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com',
            title: 'Test Page',
            description: 'Test description'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should handle URL metadata fetch failure gracefully', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockRejectedValue(new Error('Network error'));

      await client.postStatus('Check this out: https://example.com', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Check this out: https://example.com',
        createdAt: expect.any(String)
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should remove URL from text when embed is successfully created', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Test Page</title><meta name="description" content="Test description"></head></html>'),
      } as Response);

      await client.postStatus('Check this out https://example.com and tell me what you think!', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Check this out and tell me what you think!',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com',
            title: 'Test Page',
            description: 'Test description'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should handle complex URLs with paths and query parameters', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Complex URL Page</title><meta name="description" content="A page with complex URL"></head></html>'),
      } as Response);

      const complexUrl = 'https://example.com/path/to/page?param1=value1&param2=value2#section';
      await client.postStatus(`Check this complex URL: ${complexUrl} - pretty cool!`, ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Check this complex URL: - pretty cool!',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: complexUrl,
            title: 'Complex URL Page',
            description: 'A page with complex URL'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should handle URLs with special characters in query parameters', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Special Chars Page</title><meta name="description" content="Page with special chars"></head></html>'),
      } as Response);

      const specialUrl = 'https://example.com/search?q=hello+world&filter=type%3Darticle';
      await client.postStatus(`Search results: ${specialUrl} are here`, ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Search results: are here',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: specialUrl,
            title: 'Special Chars Page',
            description: 'Page with special chars'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should handle URLs at the end of text without trailing space', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>End URL Page</title><meta name="description" content="URL at end"></head></html>'),
      } as Response);

      await client.postStatus('Check this out: https://example.com/end-url', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Check this out:',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com/end-url',
            title: 'End URL Page',
            description: 'URL at end'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should preserve newlines when removing URLs', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Multiline Page</title><meta name="description" content="Page with newlines"></head></html>'),
      } as Response);

      const multilineText = `First line with URL: https://example.com/test
Second line after newline
Third line here`;

      await client.postStatus(multilineText, ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: `First line with URL:
Second line after newline
Third line here`,
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com/test',
            title: 'Multiline Page',
            description: 'Page with newlines'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should remove exactly one newline before URL when URL is on its own line', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>URL on Own Line</title><meta name="description" content="URL on separate line"></head></html>'),
      } as Response);

      const textWithUrlOnNewLine = `Check out this link:
https://example.com/standalone
More text after the URL`;

      await client.postStatus(textWithUrlOnNewLine, ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: `Check out this link:
More text after the URL`,
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com/standalone',
            title: 'URL on Own Line',
            description: 'URL on separate line'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should handle URL at the very beginning after newline', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>URL at Start</title><meta name="description" content="URL at beginning"></head></html>'),
      } as Response);

      const textWithUrlAtStart = `Some intro text:
https://example.com/at-start`;

      await client.postStatus(textWithUrlAtStart, ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Some intro text:',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com/at-start',
            title: 'URL at Start',
            description: 'URL at beginning'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should not remove newlines when URL is not preceded by one', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Inline URL</title><meta name="description" content="URL inline with text"></head></html>'),
      } as Response);

      const textWithInlineUrl = `Check this https://example.com/inline link
And this continues on next line`;

      await client.postStatus(textWithInlineUrl, ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: `Check this link
And this continues on next line`,
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com/inline',
            title: 'Inline URL',
            description: 'URL inline with text'
          }
        }
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should post status with facets for hashtags', async () => {
      await client.postStatus('Hello world! #typescript #bluesky', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Hello world! #typescript #bluesky',
        createdAt: expect.any(String),
        facets: [
          {
            index: { byteStart: 13, byteEnd: 24 },
            features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'typescript' }]
          },
          {
            index: { byteStart: 25, byteEnd: 33 },
            features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'bluesky' }]
          }
        ]
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should post status with facets for mentions', async () => {
      await client.postStatus('Hello @alice.bsky.social and @bob.example.com!', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Hello @alice.bsky.social and @bob.example.com!',
        createdAt: expect.any(String),
        facets: [
          {
            index: { byteStart: 6, byteEnd: 24 },
            features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'at://alice.bsky.social' }]
          },
          {
            index: { byteStart: 29, byteEnd: 45 },
            features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'at://bob.example.com' }]
          }
        ]
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should post status with both URL embed and facets', async () => {
      const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Test Page</title><meta name="description" content="Test description"></head></html>'),
      } as Response);

      await client.postStatus('Check out https://example.com #awesome @friend.bsky.social', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Check out #awesome @friend.bsky.social',
        createdAt: expect.any(String),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: 'https://example.com',
            title: 'Test Page',
            description: 'Test description'
          }
        },
        facets: [
          {
            index: { byteStart: 10, byteEnd: 18 },
            features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'awesome' }]
          },
          {
            index: { byteStart: 19, byteEnd: 38 },
            features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'at://friend.bsky.social' }]
          }
        ]
      });
      expect(telemetry.recordPost).toHaveBeenCalledWith('test-bluesky', 'unknown');
    });

    it('should throw error when no accounts specified', async () => {
      await expect(client.postStatus('Test message', [])).rejects.toThrow(
        'No accounts specified for posting'
      );
    });

    it('should throw error when account not found', async () => {
      await expect(client.postStatus('Test message', ['nonexistent'])).rejects.toThrow(
        'Failed to post to all Bluesky accounts: nonexistent: Bluesky account "nonexistent" not found in configuration'
      );
    });

    it('should handle posting errors gracefully', async () => {
      mockBskyAgent.post.mockRejectedValue(new Error('API Error'));

      await expect(client.postStatus('Test message', ['test-bluesky'])).rejects.toThrow(
        'Failed to post to all Bluesky accounts: test-bluesky: API Error'
      );
      expect(telemetry.recordError).toHaveBeenCalledWith('post_failed', undefined, 'test-bluesky');
    });
  });

  describe('verifyConnection', () => {
    it('should verify connection successfully for all accounts', async () => {
      const mockProfile = { handle: 'test.bsky.social', displayName: 'Test User' };
      mockBskyAgent.getProfile.mockResolvedValue({ data: mockProfile });

      const result = await client.verifyConnection();

      expect(result).toBe(true);
      expect(mockBskyAgent.getProfile).toHaveBeenCalledWith({
        actor: 'test.bsky.social'
      });
    });

    it('should return false when connection verification fails', async () => {
      mockBskyAgent.getProfile.mockRejectedValue(new Error('Connection failed'));

      const result = await client.verifyConnection();

      expect(result).toBe(false);
    });

    it('should return true when no Bluesky accounts configured', async () => {
      const emptyConfig = { ...config, accounts: [] };
      const emptyClient = new BlueskyClient(emptyConfig, logger, telemetry);
      
      // Wait for async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      const result = await emptyClient.verifyConnection();

      expect(result).toBe(true);
    });
  });

  describe('getAccountInfo', () => {
    it('should get account info successfully for specific account', async () => {
      const mockProfileData = {
        handle: 'test.bsky.social',
        displayName: 'Test User',
        followersCount: 100,
        followingCount: 50
      };
      mockBskyAgent.getProfile.mockResolvedValue({ data: mockProfileData });

      const result = await client.getAccountInfo('test-bluesky');

      expect(result).toEqual(mockProfileData);
      expect(mockBskyAgent.getProfile).toHaveBeenCalledWith({
        actor: 'test.bsky.social'
      });
    });

    it('should handle get account info error', async () => {
      mockBskyAgent.getProfile.mockRejectedValue(new Error('API Error'));

      await expect(client.getAccountInfo('test-bluesky')).rejects.toThrow(
        'Failed to get Bluesky account info for test-bluesky: API Error'
      );
    });

    it('should throw error for unknown account', async () => {
      await expect(client.getAccountInfo('nonexistent')).rejects.toThrow(
        'Bluesky account "nonexistent" not found in configuration'
      );
    });
  });

  describe('utility methods', () => {
    it('should return account names', () => {
      const names = client.getAccountNames();
      expect(names).toEqual(['test-bluesky']);
    });

    it('should check if account exists', () => {
      expect(client.hasAccount('test-bluesky')).toBe(true);
      expect(client.hasAccount('nonexistent')).toBe(false);
    });
  });
});