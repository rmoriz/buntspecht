import { MastodonClient } from '../services/mastodonClient';
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
      mastodon: {
        instance: 'https://test.mastodon',
        accessToken: 'test-token',
      },
      bot: {
        providers: [
          {
            name: 'test-provider',
            type: 'ping',
            cronSchedule: '0 * * * *',
            enabled: true,
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

    client = new MastodonClient(config, logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize Masto client with correct config', () => {
      const { createRestAPIClient } = require('masto');
      
      expect(createRestAPIClient).toHaveBeenCalledWith({
        url: 'https://test.mastodon',
        accessToken: 'test-token',
      });
    });
  });

  describe('postStatus', () => {
    it('should post status successfully', async () => {
      const mockStatus = { id: '12345' };
      mockMastodonApi.v1.statuses.create.mockResolvedValue(mockStatus);

      await client.postStatus('Test message');

      expect(mockMastodonApi.v1.statuses.create).toHaveBeenCalledWith({
        status: 'Test message',
      });
      expect(logger.info).toHaveBeenCalledWith('Posting status: "Test message"');
      expect(logger.info).toHaveBeenCalledWith('Status posted successfully. ID: 12345');
    });

    it('should handle post status error', async () => {
      const error = new Error('API Error');
      mockMastodonApi.v1.statuses.create.mockRejectedValue(error);

      await expect(client.postStatus('Test message')).rejects.toThrow(
        'Failed to post status: API Error'
      );
      expect(logger.error).toHaveBeenCalledWith('Failed to post status:', error);
    });

    it('should handle unknown error', async () => {
      mockMastodonApi.v1.statuses.create.mockRejectedValue('Unknown error');

      await expect(client.postStatus('Test message')).rejects.toThrow(
        'Failed to post status: Unknown error'
      );
    });
  });

  describe('verifyConnection', () => {
    it('should verify connection successfully', async () => {
      const mockAccount = { username: 'testuser' };
      mockMastodonApi.v1.accounts.verifyCredentials.mockResolvedValue(mockAccount);

      const result = await client.verifyConnection();

      expect(result).toBe(true);
      expect(mockMastodonApi.v1.accounts.verifyCredentials).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Verifying Mastodon connection...');
      expect(logger.info).toHaveBeenCalledWith(
        'Connected to Mastodon as: @testuser@test.mastodon'
      );
    });

    it('should handle connection verification error', async () => {
      const error = new Error('Connection failed');
      mockMastodonApi.v1.accounts.verifyCredentials.mockRejectedValue(error);

      const result = await client.verifyConnection();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to verify Mastodon connection:', error);
    });
  });

  describe('getAccountInfo', () => {
    it('should get account info successfully', async () => {
      const mockAccountData = {
        username: 'testuser',
        displayName: 'Test User',
        followersCount: 100,
        followingCount: 50,
      };
      mockMastodonApi.v1.accounts.verifyCredentials.mockResolvedValue(mockAccountData);

      const result = await client.getAccountInfo();

      expect(result).toEqual(mockAccountData);
      expect(mockMastodonApi.v1.accounts.verifyCredentials).toHaveBeenCalled();
    });

    it('should handle get account info error', async () => {
      const error = new Error('API Error');
      mockMastodonApi.v1.accounts.verifyCredentials.mockRejectedValue(error);

      await expect(client.getAccountInfo()).rejects.toThrow(
        'Failed to get account info: API Error'
      );
      expect(logger.error).toHaveBeenCalledWith('Failed to get account info:', error);
    });

    it('should handle unknown error in getAccountInfo', async () => {
      mockMastodonApi.v1.accounts.verifyCredentials.mockRejectedValue('Unknown error');

      await expect(client.getAccountInfo()).rejects.toThrow(
        'Failed to get account info: Unknown error'
      );
    });
  });
});