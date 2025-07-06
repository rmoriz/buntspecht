import { BlueskyClient } from '../services/blueskyClient';
import type { TelemetryService } from '../services/telemetryInterface';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';

// Mock @atproto/api
jest.mock('@atproto/api');

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

  beforeEach(() => {
    // Create mock Bluesky agent
    mockBskyAgent = {
      login: jest.fn(),
      post: jest.fn(),
      getProfile: jest.fn(),
    };

    // Mock the BskyAgent constructor
    const { BskyAgent } = require('@atproto/api');
    BskyAgent.mockImplementation(() => mockBskyAgent);

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
    } as any;

    // Mock successful login
    mockBskyAgent.login.mockResolvedValue({});
    mockBskyAgent.session = {
      accessJwt: 'mock-jwt',
      refreshJwt: 'mock-refresh',
      handle: 'test.bsky.social',
      did: 'did:plc:test'
    };

    client = new BlueskyClient(config, logger, telemetry);
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

    it('should skip non-bluesky accounts', () => {
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

      // Should not create any Bluesky agents for mastodon accounts
      expect(mockBskyAgent.login).not.toHaveBeenCalled();
    });

    it('should handle login errors gracefully', () => {
      mockBskyAgent.login.mockRejectedValue(new Error('Login failed'));
      
      // Should not throw during construction
      expect(() => new BlueskyClient(config, logger, telemetry)).not.toThrow();
    });
  });

  describe('postStatus', () => {
    beforeEach(() => {
      // Ensure client is properly initialized
      mockBskyAgent.post.mockResolvedValue({
        uri: 'at://did:plc:test/app.bsky.feed.post/test123',
        cid: 'test-cid'
      });
    });

    it('should post status successfully to Bluesky account', async () => {
      await client.postStatus('Test message', ['test-bluesky']);

      expect(mockBskyAgent.post).toHaveBeenCalledWith({
        text: 'Test message',
        createdAt: expect.any(String)
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