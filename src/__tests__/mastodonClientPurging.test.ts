import { MastodonClient } from '../services/mastodonClient';
import { BotConfig, AccountConfig } from '../types/config';
import { createRestAPIClient } from 'masto';

// Mock masto library - Jest hoists this to the top
jest.mock('masto', () => {
  const mockClient = {
    v1: {
      accounts: {
        verifyCredentials: jest.fn(),
        $select: jest.fn(() => ({
          statuses: {
            list: jest.fn()
          }
        }))
      },
      statuses: {
        $select: jest.fn(() => ({
          remove: jest.fn()
        }))
      }
    }
  };

  return {
    createRestAPIClient: jest.fn().mockReturnValue(mockClient)
  };
});

describe('MastodonClient - Purging', () => {
  let client: MastodonClient;
  let mockLogger: any;
  let mockTelemetry: any;
  let config: BotConfig;
  let mockClient: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLevel: jest.fn(),
      isDebugEnabled: jest.fn().mockReturnValue(true),
      isInfoEnabled: jest.fn().mockReturnValue(true),
    };
    mockTelemetry = {
      startSpan: jest.fn().mockReturnValue({
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      }),
      recordPost: jest.fn(),
      recordError: jest.fn(),
      incrementCounter: jest.fn(),
    };
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Get the mocked client from the mocked createRestAPIClient
    const mockCreateRestAPIClient = createRestAPIClient as jest.MockedFunction<typeof createRestAPIClient>;
    mockClient = mockCreateRestAPIClient({
      url: 'https://test.mastodon',
      accessToken: 'test-token'
    });
    
    // Mock account verification
    mockClient.v1.accounts.verifyCredentials.mockResolvedValue({
      id: '123',
      username: 'testuser',
      displayName: 'Test User'
    });

    config = {
      accounts: [
        {
          name: 'test-account',
          type: 'mastodon',
          instance: 'https://mastodon.social',
          accessToken: 'test-token',
          purging: {
            enabled: true,
            olderThanDays: 30,
            preserveStarredPosts: true,
            preservePinnedPosts: true,
            minStarsToPreserve: 5,
            dryRun: false,
            batchSize: 20,
            delayBetweenBatches: 100
          }
        } as AccountConfig,
        {
          name: 'test-account-disabled',
          type: 'mastodon',
          instance: 'https://mastodon.social',
          accessToken: 'test-token-2',
          purging: {
            enabled: false,
            olderThanDays: 30
          }
        } as AccountConfig
      ],
      bot: {
        providers: []
      },
      logging: {
        level: 'debug' as const
      }
    };

    client = new MastodonClient(config, mockLogger, mockTelemetry);
  });

  describe('purgeOldPosts', () => {
    it('should skip accounts without purging enabled', async () => {
      await client.purgeOldPosts(['test-account-disabled']);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Purging not enabled for account "test-account-disabled", skipping'
      );
    });

    it('should skip accounts with invalid olderThanDays configuration', async () => {
      config.accounts[0].purging = { ...config.accounts[0].purging, olderThanDays: 0 };
      client = new MastodonClient(config, mockLogger, mockTelemetry);
      
      await client.purgeOldPosts(['test-account']);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid olderThanDays configuration for account "test-account", skipping'
      );
    });

    it('should process posts and delete old ones', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const oldPost = {
        id: '1',
        createdAt: new Date(cutoffDate.getTime() - 86400000).toISOString(), // 1 day older
        favouritesCount: 2
      };
      
      const recentPost = {
        id: '2',
        createdAt: new Date().toISOString(),
        favouritesCount: 1
      };
      
      const starredOldPost = {
        id: '3',
        createdAt: new Date(cutoffDate.getTime() - 86400000).toISOString(),
        favouritesCount: 10 // Above threshold
      };

      // Setup mock for status list calls
      const mockStatusList = jest.fn()
        .mockResolvedValueOnce([]) // First call for pinned posts
        .mockResolvedValueOnce([oldPost, recentPost, starredOldPost]) // Second call for regular posts
        .mockResolvedValueOnce([]); // Third call returns empty (end of pagination)
      
      mockClient.v1.accounts.$select.mockReturnValue({
        statuses: {
          list: mockStatusList
        }
      });

      // Mock status deletion
      mockClient.v1.statuses.$select.mockReturnValue({
        remove: jest.fn().mockResolvedValue({})
      });

      await client.purgeOldPosts(['test-account']);

      // Should delete only the old post without enough stars
      expect(mockClient.v1.statuses.$select).toHaveBeenCalledWith('1');
      expect(mockClient.v1.statuses.$select().remove).toHaveBeenCalledTimes(1);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('1 posts deleted, 2 posts preserved')
      );
    });

    it('should handle dry run mode', async () => {
      config.accounts[0].purging = { ...config.accounts[0].purging, dryRun: true };
      client = new MastodonClient(config, mockLogger, mockTelemetry);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const oldPost = {
        id: '1',
        createdAt: new Date(cutoffDate.getTime() - 86400000).toISOString(),
        favouritesCount: 2
      };

      // Setup mock for status list calls
      const mockStatusList = jest.fn()
        .mockResolvedValueOnce([]) // First call for pinned posts
        .mockResolvedValueOnce([oldPost]) // Second call for regular posts
        .mockResolvedValueOnce([]); // Third call returns empty (end of pagination)
      
      mockClient.v1.accounts.$select.mockReturnValue({
        statuses: {
          list: mockStatusList
        }
      });

      await client.purgeOldPosts(['test-account']);

      // Should not actually delete in dry run mode
      expect(mockClient.v1.statuses.$select().remove).not.toHaveBeenCalled();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN] Would delete post 1')
      );
    });

    it('should preserve pinned posts', async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const pinnedOldPost = {
        id: '1',
        createdAt: new Date(cutoffDate.getTime() - 86400000).toISOString(),
        favouritesCount: 2
      };

      // Setup mock for status list calls
      const mockStatusList = jest.fn()
        .mockResolvedValueOnce([pinnedOldPost]) // First call for pinned posts
        .mockResolvedValueOnce([pinnedOldPost]) // Second call for regular posts
        .mockResolvedValueOnce([]); // Third call returns empty (end of pagination)
      
      mockClient.v1.accounts.$select.mockReturnValue({
        statuses: {
          list: mockStatusList
        }
      });

      await client.purgeOldPosts(['test-account']);

      // Should not delete the pinned post
      expect(mockClient.v1.statuses.$select().remove).not.toHaveBeenCalled();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping pinned post 1'
      );
    });

    it('should handle errors gracefully', async () => {
      mockClient.v1.accounts.verifyCredentials.mockRejectedValue(new Error('API Error'));
      
      await expect(client.purgeOldPosts(['test-account'])).rejects.toThrow('Post purge failed for test-account: API Error');
    });

    it('should process all accounts when no specific accounts provided', async () => {
      // Mock empty responses for all calls
      mockClient.v1.accounts.$select().statuses.list.mockResolvedValue([]);
      
      await client.purgeOldPosts();
      
      // Should process the enabled account
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting post purge for account "test-account"')
      );
      
      // Should skip the disabled account
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Purging not enabled for account "test-account-disabled", skipping'
      );
    });
  });

  describe('getPinnedPosts', () => {
    it('should return empty set when pinned posts fetch fails', async () => {
      // Setup mock to fail on first call (pinned posts) but succeed on second call (regular posts)
      const mockStatusList = jest.fn()
        .mockRejectedValueOnce(new Error('API Error')) // First call for pinned posts fails
        .mockResolvedValueOnce([]) // Second call for regular posts succeeds
        .mockResolvedValueOnce([]); // Third call returns empty (end of pagination)
      
      mockClient.v1.accounts.$select.mockReturnValue({
        statuses: {
          list: mockStatusList
        }
      });
      
      await client.purgeOldPosts(['test-account']);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch pinned posts for account "test-account"'),
        expect.any(Error)
      );
    });
  });
});