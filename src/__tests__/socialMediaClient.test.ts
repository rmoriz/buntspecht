import { SocialMediaClient } from '../services/socialMediaClient';
import { MastodonClient } from '../services/mastodonClient';
import { BlueskyClient } from '../services/blueskyClient';
import type { TelemetryService } from '../services/telemetryInterface';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';

// Mock the client services
jest.mock('../services/mastodonClient');
jest.mock('../services/blueskyClient');

describe('SocialMediaClient', () => {
  let config: BotConfig;
  let logger: Logger;
  let telemetry: TelemetryService;
  let client: SocialMediaClient;
  let mockMastodonClient: jest.Mocked<MastodonClient>;
  let mockBlueskyClient: jest.Mocked<BlueskyClient>;

  beforeEach(() => {
    config = {
      accounts: [
        {
          name: 'mastodon-account',
          type: 'mastodon',
          instance: 'https://mastodon.social',
          accessToken: 'mastodon-token'
        },
        {
          name: 'bluesky-account',
          type: 'bluesky',
          instance: 'https://bsky.social',
          accessToken: '',
          identifier: 'test.bsky.social',
          password: 'app-password'
        }
      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['mastodon-account', 'bluesky-account'],
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

    // Create mocked instances
    mockMastodonClient = {
      postStatus: jest.fn(),
      postStatusWithAttachments: jest.fn(),
      verifyConnection: jest.fn(),
      getAccountInfo: jest.fn(),
      getAllAccountsInfo: jest.fn(),
      getAccountNames: jest.fn(),
      hasAccount: jest.fn()
    } as unknown as jest.Mocked<MastodonClient>;

    mockBlueskyClient = {
      postStatus: jest.fn(),
      postStatusWithAttachments: jest.fn(),
      verifyConnection: jest.fn(),
      getAccountInfo: jest.fn(),
      getAllAccountsInfo: jest.fn(),
      getAccountNames: jest.fn(),
      hasAccount: jest.fn()
    } as unknown as jest.Mocked<BlueskyClient>;

    // Mock the constructors
    (MastodonClient as jest.MockedClass<typeof MastodonClient>).mockImplementation(() => mockMastodonClient);
    (BlueskyClient as jest.MockedClass<typeof BlueskyClient>).mockImplementation(() => mockBlueskyClient);

    client = new SocialMediaClient(config, logger, telemetry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize both Mastodon and Bluesky clients', () => {
      expect(MastodonClient).toHaveBeenCalledWith(config, logger, telemetry);
      expect(BlueskyClient).toHaveBeenCalledWith(config, logger, telemetry);
    });
  });

  describe('postStatus', () => {
    it('should route accounts to appropriate platforms', async () => {
      mockMastodonClient.postStatusWithAttachments.mockResolvedValue();
      mockBlueskyClient.postStatusWithAttachments.mockResolvedValue();

      await client.postStatus('Test message', ['mastodon-account', 'bluesky-account'], 'test-provider');

      expect(mockMastodonClient.postStatusWithAttachments).toHaveBeenCalledWith(
        { text: 'Test message' },
        ['mastodon-account'],
        'test-provider',
        undefined
      );
      expect(mockBlueskyClient.postStatusWithAttachments).toHaveBeenCalledWith(
        { text: 'Test message' },
        ['bluesky-account'],
        'test-provider'
      );
    });

    it('should handle Mastodon-only posting', async () => {
      mockMastodonClient.postStatusWithAttachments.mockResolvedValue();

      await client.postStatus('Test message', ['mastodon-account'], 'test-provider');

      expect(mockMastodonClient.postStatusWithAttachments).toHaveBeenCalledWith(
        { text: 'Test message' },
        ['mastodon-account'],
        'test-provider',
        undefined
      );
      expect(mockBlueskyClient.postStatusWithAttachments).not.toHaveBeenCalled();
    });

    it('should handle Bluesky-only posting', async () => {
      mockBlueskyClient.postStatusWithAttachments.mockResolvedValue();

      await client.postStatus('Test message', ['bluesky-account'], 'test-provider');

      expect(mockBlueskyClient.postStatusWithAttachments).toHaveBeenCalledWith(
        { text: 'Test message' },
        ['bluesky-account'],
        'test-provider'
      );
      expect(mockMastodonClient.postStatusWithAttachments).not.toHaveBeenCalled();
    });

    it('should handle unknown accounts gracefully', async () => {
      // Should not throw, just skip unknown accounts
      await client.postStatus('Test message', ['unknown-account'], 'test-provider');

      expect(mockMastodonClient.postStatusWithAttachments).not.toHaveBeenCalled();
      expect(mockBlueskyClient.postStatusWithAttachments).not.toHaveBeenCalled();
    });

    it('should throw error when no accounts specified', async () => {
      await expect(client.postStatus('Test message', [], 'test-provider')).rejects.toThrow(
        'No accounts specified for posting'
      );
    });
  });

  describe('verifyConnection', () => {
    it('should verify connections for both platforms', async () => {
      mockMastodonClient.verifyConnection.mockResolvedValue(true);
      mockBlueskyClient.verifyConnection.mockResolvedValue(true);

      const result = await client.verifyConnection();

      expect(result).toBe(true);
      expect(mockMastodonClient.verifyConnection).toHaveBeenCalled();
      expect(mockBlueskyClient.verifyConnection).toHaveBeenCalled();
    });

    it('should return false if any platform fails verification', async () => {
      mockMastodonClient.verifyConnection.mockResolvedValue(true);
      mockBlueskyClient.verifyConnection.mockResolvedValue(false);

      const result = await client.verifyConnection();

      expect(result).toBe(false);
    });
  });

  describe('getAccountInfo', () => {
    it('should route to Mastodon client for mastodon accounts', async () => {
      const mockAccountData = { 
        id: '123',
        acct: 'testuser',
        username: 'testuser', 
        displayName: 'Test User',
        url: 'https://mastodon.social/@testuser',
        note: 'Test bio',
        avatar: 'https://example.com/avatar.jpg',
        avatarStatic: 'https://example.com/avatar.jpg',
        header: 'https://example.com/header.jpg',
        headerStatic: 'https://example.com/header.jpg',
        locked: false,
        bot: false,
        discoverable: true,
        group: false,
        noindex: false,
        suspended: false,
        limited: false,
        createdAt: '2023-01-01T00:00:00.000Z',
        lastStatusAt: '2023-01-01T00:00:00.000Z',
        statusesCount: 0,
        followersCount: 0,
        followingCount: 0,
        fields: [],
        emojis: [],
        roles: []
      };
      mockMastodonClient.getAccountInfo.mockResolvedValue(mockAccountData);

      const result = await client.getAccountInfo('mastodon-account');

      expect(result).toEqual(mockAccountData);
      expect(mockMastodonClient.getAccountInfo).toHaveBeenCalledWith('mastodon-account');
    });

    it('should route to Bluesky client for bluesky accounts', async () => {
      const mockAccountData = { handle: 'test.bsky.social', displayName: 'Test User' };
      mockBlueskyClient.getAccountInfo.mockResolvedValue(mockAccountData);

      const result = await client.getAccountInfo('bluesky-account');

      expect(result).toEqual(mockAccountData);
      expect(mockBlueskyClient.getAccountInfo).toHaveBeenCalledWith('bluesky-account');
    });

    it('should throw error for unknown account', async () => {
      await expect(client.getAccountInfo('unknown-account')).rejects.toThrow(
        'Account "unknown-account" not found in configuration'
      );
    });
  });

  describe('getAllAccountsInfo', () => {
    it('should combine account info from both platforms', async () => {
      const mastodonAccounts = [
        { accountName: 'mastodon-account', account: { username: 'testuser' } as unknown, instance: 'https://mastodon.social' }
      ];
      const blueskyAccounts = [
        { accountName: 'bluesky-account', account: { handle: 'test.bsky.social' } as unknown, instance: 'https://bsky.social' }
      ];

      mockMastodonClient.getAllAccountsInfo.mockResolvedValue(mastodonAccounts as never);
      mockBlueskyClient.getAllAccountsInfo.mockResolvedValue(blueskyAccounts as never);

      const result = await client.getAllAccountsInfo();

      expect(result).toEqual([
        { ...mastodonAccounts[0], platform: 'mastodon' },
        { ...blueskyAccounts[0], platform: 'bluesky' }
      ]);
    });
  });

  describe('utility methods', () => {
    it('should return all account names', () => {
      const names = client.getAccountNames();
      expect(names).toEqual(['mastodon-account', 'bluesky-account']);
    });

    it('should check if account exists', () => {
      expect(client.hasAccount('mastodon-account')).toBe(true);
      expect(client.hasAccount('bluesky-account')).toBe(true);
      expect(client.hasAccount('unknown-account')).toBe(false);
    });

    it('should provide access to individual clients', () => {
      expect(client.getMastodonClient()).toBe(mockMastodonClient);
      expect(client.getBlueskyClient()).toBe(mockBlueskyClient);
    });
  });
});