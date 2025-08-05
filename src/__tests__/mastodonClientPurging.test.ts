import { MastodonClient } from '../services/mastodonClient';
import { BotConfig, AccountConfig } from '../types/config';
import { TestHelpers } from './utils/testHelpers';

// Mock masto library
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

const mockCreateRestAPIClient = jest.fn().mockReturnValue(mockClient);

jest.mock('masto', () => ({
  createRestAPIClient: mockCreateRestAPIClient
}));

describe('MastodonClient - Purging', () => {
  let client: MastodonClient;
  let mockLogger: any;
  let mockTelemetry: any;
  let config: BotConfig;

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
      recordCustomMetric: jest.fn(),
    };
    
    // Reset mocks
    jest.clearAllMocks();
    mockCreateRestAPIClient.mockReturnValue(mockClient);
    
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

      // Mock status list to return our test posts
      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([oldPost, recentPost, starredOldPost])
        .mockResolvedValueOnce([]); // Second call returns empty (end of pagination)

      // Mock pinned posts (empty)
      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([]); // For pinned posts call

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

      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([oldPost])
        .mockResolvedValueOnce([]);

      // Mock pinned posts (empty)
      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([]);

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

      // Mock pinned posts to include our test post
      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([pinnedOldPost]); // For pinned posts call

      // Mock regular posts to include the same post
      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([pinnedOldPost])
        .mockResolvedValueOnce([]);

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
      mockClient.v1.accounts.$select().statuses.list.mockRejectedValue(new Error('API Error'));
      
      // Call purgeOldPosts to trigger getPinnedPosts internally
      mockClient.v1.accounts.$select().statuses.list
        .mockResolvedValueOnce([]); // For main posts call
      
      await client.purgeOldPosts(['test-account']);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch pinned posts for account "test-account"'),
        expect.any(Error)
      );
    });
  });
});