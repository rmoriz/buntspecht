import { MastodonClient } from '../services/mastodonClient';
import type { TelemetryService } from '../services/telemetryInterface';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';

// Mock masto
jest.mock('masto');

interface MockMastodonApi {
  v1: {
    statuses: {
      create: jest.Mock;
    };
    accounts: {
      verifyCredentials: jest.Mock;
    };
  };
}

describe('MastodonClient', () => {
  let mockMastodonApi: MockMastodonApi;
  let config: BotConfig;
  let logger: Logger;
  let telemetry: TelemetryService;
  let client: MastodonClient;

  beforeEach(() => {
    // Create mock Masto API
    mockMastodonApi = {
      v1: {
        statuses: {
          create: jest.fn(),
        },
        accounts: {
          verifyCredentials: jest.fn(),
        },
      },
    };

    // Mock the createRestAPIClient function
    const { createRestAPIClient } = require('masto');
    createRestAPIClient.mockReturnValue(mockMastodonApi);

    config = {
      accounts: [
        {
           name: 'test-account',
           instance: 'https://test.mastodon',
           accessToken: 'test-token',
           language: 'de',
         }      ],
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
            accounts: ['test-account'],
            config: { message: 'PING' }
          }
        ]
      },
      logging: {
        level: 'info',
      },
    };

    logger = new Logger('info');
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
    jest.spyOn(logger, 'debug').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();

    // Create mock telemetry service
    telemetry = {
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
      startSpan: jest.fn().mockReturnValue({
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      }),
      recordPost: jest.fn(),
      recordError: jest.fn(),
      recordProviderExecution: jest.fn(),
      updateActiveConnections: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(false),
      getTracer: jest.fn(),
      getMeter: jest.fn(),
    } as unknown as jest.Mocked<TelemetryService>;

    client = new MastodonClient(config, logger, telemetry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize Masto clients for all accounts', () => {
      const { createRestAPIClient } = require('masto');
      
      expect(createRestAPIClient).toHaveBeenCalledWith({
        url: 'https://test.mastodon',
        accessToken: 'test-token',
      });
      expect(createRestAPIClient).toHaveBeenCalledTimes(1);
    });

    it('should initialize multiple clients for multiple accounts', () => {
      const { createRestAPIClient } = require('masto');
      createRestAPIClient.mockClear();

      const multiAccountConfig = {
        ...config,
        accounts: [
          { name: 'account1', instance: 'https://fosstodon.org', accessToken: 'token1' },
          { name: 'account2', instance: 'https://mastodon.online', accessToken: 'token2' }
        ]
      };

      new MastodonClient(multiAccountConfig, logger, telemetry);

      expect(createRestAPIClient).toHaveBeenCalledWith({
        url: 'https://fosstodon.org',
        accessToken: 'token1',
      });
      expect(createRestAPIClient).toHaveBeenCalledWith({
        url: 'https://mastodon.online',
        accessToken: 'token2',
      });
      expect(createRestAPIClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('postStatus', () => {
    it('should post status successfully to specified account', async () => {
      const mockStatus = { id: '12345' };
      mockMastodonApi.v1.statuses.create.mockResolvedValue(mockStatus);

      await client.postStatus('Test message', ['test-account']);

       expect(mockMastodonApi.v1.statuses.create).toHaveBeenCalledWith({
         status: 'Test message',
         visibility: 'unlisted',
         language: 'de',
       });      expect(logger.info).toHaveBeenCalledWith('Posting status to test-account (https://test.mastodon) with visibility \'unlisted\' (12 chars): "Test message"');
      expect(logger.info).toHaveBeenCalledWith('Status posted successfully to test-account. ID: 12345');
    });

    it('should post status to multiple accounts', async () => {
      const multiAccountConfig = {
        ...config,
        accounts: [
          { name: 'account1', instance: 'https://fosstodon.org', accessToken: 'token1' },
          { name: 'account2', instance: 'https://mastodon.online', accessToken: 'token2' }
        ]
      };

      const multiClient = new MastodonClient(multiAccountConfig, logger, telemetry);
      const mockStatus1 = { id: '111' };
      const mockStatus2 = { id: '222' };
      
      mockMastodonApi.v1.statuses.create
        .mockResolvedValueOnce(mockStatus1)
        .mockResolvedValueOnce(mockStatus2);

      await multiClient.postStatus('Test message', ['account1', 'account2']);

      expect(mockMastodonApi.v1.statuses.create).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Posting status to account1 (https://fosstodon.org) with visibility \'unlisted\' (12 chars): "Test message"');
      expect(logger.info).toHaveBeenCalledWith('Posting status to account2 (https://mastodon.online) with visibility \'unlisted\' (12 chars): "Test message"');
    });

    it('should throw error when no accounts specified', async () => {
      await expect(client.postStatus('Test message', [])).rejects.toThrow(
        'No accounts specified for posting'
      );
    });

    it('should throw error when account not found', async () => {
      await expect(client.postStatus('Test message', ['nonexistent'])).rejects.toThrow(
        'Failed to post to all accounts: nonexistent: Account "nonexistent" not found in configuration'
      );
    });

    it('should handle partial failures gracefully', async () => {
      const multiAccountConfig = {
        ...config,
        accounts: [
          { name: 'account1', instance: 'https://fosstodon.org', accessToken: 'token1' },
          { name: 'account2', instance: 'https://mastodon.online', accessToken: 'token2' }
        ]
      };

      const multiClient = new MastodonClient(multiAccountConfig, logger, telemetry);
      const mockStatus = { id: '111' };
      
      mockMastodonApi.v1.statuses.create
        .mockResolvedValueOnce(mockStatus)
        .mockRejectedValueOnce(new Error('API Error'));

      // Should not throw, but should log warning
      await multiClient.postStatus('Test message', ['account1', 'account2']);

      expect(logger.warn).toHaveBeenCalledWith('Some posts failed: account2: API Error');
    });

    it('should throw error when all posts fail', async () => {
      const error = new Error('API Error');
      mockMastodonApi.v1.statuses.create.mockRejectedValue(error);

      await expect(client.postStatus('Test message', ['test-account'])).rejects.toThrow(
        'Failed to post to all accounts: test-account: API Error'
      );
    });
  });

  describe('verifyConnection', () => {
    it('should verify connection successfully for all accounts', async () => {
      const mockAccount = { username: 'testuser' };
      mockMastodonApi.v1.accounts.verifyCredentials.mockResolvedValue(mockAccount);

      const result = await client.verifyConnection();

      expect(result).toBe(true);
      expect(mockMastodonApi.v1.accounts.verifyCredentials).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Verifying connection for account: test-account...');
      expect(logger.info).toHaveBeenCalledWith(
        'Connected to test-account as: @testuser@test.mastodon'
      );
    });

    it('should handle connection verification error', async () => {
      const error = new Error('Connection failed');
      mockMastodonApi.v1.accounts.verifyCredentials.mockRejectedValue(error);

      const result = await client.verifyConnection();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to verify connection for test-account:', error);
    });

    it('should return false when no accounts configured', async () => {
      const emptyConfig = { ...config, accounts: [] };
      const emptyClient = new MastodonClient(emptyConfig, logger, telemetry);

      const result = await emptyClient.verifyConnection();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('No accounts configured');
    });
  });

  describe('getAccountInfo', () => {
    it('should get account info successfully for specific account', async () => {
      const mockAccountData = {
        username: 'testuser',
        displayName: 'Test User',
        followersCount: 100,
        followingCount: 50,
      };
      mockMastodonApi.v1.accounts.verifyCredentials.mockResolvedValue(mockAccountData);

      const result = await client.getAccountInfo('test-account');

      expect(result).toEqual(mockAccountData);
      expect(mockMastodonApi.v1.accounts.verifyCredentials).toHaveBeenCalled();
    });

    it('should handle get account info error', async () => {
      const error = new Error('API Error');
      mockMastodonApi.v1.accounts.verifyCredentials.mockRejectedValue(error);

      await expect(client.getAccountInfo('test-account')).rejects.toThrow(
        'Failed to get account info for test-account: API Error'
      );
      expect(logger.error).toHaveBeenCalledWith('Failed to get account info for test-account:', error);
    });

    it('should throw error for unknown account', async () => {
      await expect(client.getAccountInfo('nonexistent')).rejects.toThrow(
        'Account "nonexistent" not found in configuration'
      );
    });
  });

  describe('getAllAccountsInfo', () => {
    it('should get info for all accounts', async () => {
      const mockAccountData = {
        username: 'testuser',
        displayName: 'Test User',
        followersCount: 100,
        followingCount: 50,
      };
      mockMastodonApi.v1.accounts.verifyCredentials.mockResolvedValue(mockAccountData);

      const result = await client.getAllAccountsInfo();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        accountName: 'test-account',
        account: mockAccountData,
        instance: 'https://test.mastodon'
      });
    });

    it('should continue with other accounts if one fails', async () => {
      const multiAccountConfig = {
        ...config,
        accounts: [
          { name: 'account1', instance: 'https://fosstodon.org', accessToken: 'token1' },
          { name: 'account2', instance: 'https://mastodon.online', accessToken: 'token2' }
        ]
      };

      const multiClient = new MastodonClient(multiAccountConfig, logger, telemetry);
      const mockAccountData = { username: 'user1', displayName: 'User 1', followersCount: 10, followingCount: 5 };
      
      mockMastodonApi.v1.accounts.verifyCredentials
        .mockResolvedValueOnce(mockAccountData)
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await multiClient.getAllAccountsInfo();

      expect(result).toHaveLength(1);
      expect(result[0].accountName).toBe('account1');
      expect(logger.error).toHaveBeenCalledWith('Failed to get account info for account2:', expect.any(Error));
    });
  });

  describe('utility methods', () => {
    it('should return account names', () => {
      const names = client.getAccountNames();
      expect(names).toEqual(['test-account']);
    });

    it('should check if account exists', () => {
      expect(client.hasAccount('test-account')).toBe(true);
      expect(client.hasAccount('nonexistent')).toBe(false);
    });
  });

  describe('blacklisted instances', () => {
    it('should reject mastodon.social by default', () => {
      const blacklistedConfig = {
        ...config,
        accounts: [
          { name: 'banned-account', instance: 'https://mastodon.social', accessToken: 'token1' }
        ]
      };

      expect(() => new MastodonClient(blacklistedConfig, logger, telemetry)).toThrow(
        'Cannot initialize Mastodon account "banned-account": Instance "https://mastodon.social" is blacklisted (toxic moderation)'
      );
    });

    it('should reject custom blacklisted instance from config', () => {
      const blacklistedConfig = {
        ...config,
        accounts: [
          { name: 'custom-banned', instance: 'https://bad-instance.com', accessToken: 'token1' }
        ],
        mastodon: {
          blacklistedInstances: [
            { domain: 'bad-instance.com', reason: 'spam source' }
          ]
        }
      };

      expect(() => new MastodonClient(blacklistedConfig, logger, telemetry)).toThrow(
        'Cannot initialize Mastodon account "custom-banned": Instance "https://bad-instance.com" is blacklisted (spam source)'
      );
    });

    it('should allow non-blacklisted instances', () => {
      const allowedConfig = {
        ...config,
        accounts: [
          { name: 'allowed-account', instance: 'https://fosstodon.org', accessToken: 'token1' }
        ]
      };

      expect(() => new MastodonClient(allowedConfig, logger, telemetry)).not.toThrow();
    });

    it('should be case-insensitive when checking blacklist', () => {
      const blacklistedConfig = {
        ...config,
        accounts: [
          { name: 'banned-account', instance: 'https://MASTODON.SOCIAL', accessToken: 'token1' }
        ]
      };

      expect(() => new MastodonClient(blacklistedConfig, logger, telemetry)).toThrow(
        'Cannot initialize Mastodon account "banned-account": Instance "https://MASTODON.SOCIAL" is blacklisted (toxic moderation)'
      );
    });

    it('should reject blacklisted instance on reinitializeAccount', async () => {
      const blacklistedAccount = {
        name: 'test-account',
        instance: 'https://mastodon.social',
        accessToken: 'new-token'
      };

      await expect(client.reinitializeAccount(blacklistedAccount)).rejects.toThrow(
        'Cannot reinitialize Mastodon account "test-account": Instance "https://mastodon.social" is blacklisted (toxic moderation)'
      );
    });
  });
});