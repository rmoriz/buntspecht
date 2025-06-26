import { MastodonClient } from '../services/mastodonClient';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';

// Mock mastodon-api
jest.mock('mastodon-api');

describe('MastodonClient', () => {
  let mockMastodonApi: any;
  let config: BotConfig;
  let logger: Logger;
  let client: MastodonClient;

  beforeEach(() => {
    // Create mock Mastodon API
    mockMastodonApi = {
      post: jest.fn(),
      get: jest.fn(),
    };

    // Mock the Mastodon constructor
    const MastodonMock = require('mastodon-api');
    MastodonMock.mockImplementation(() => mockMastodonApi);

    config = {
      mastodon: {
        instance: 'https://test.mastodon',
        accessToken: 'test-token',
      },
      bot: {
        message: 'PING',
        cronSchedule: '0 * * * *',
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
    it('should initialize Mastodon client with correct config', () => {
      const MastodonMock = require('mastodon-api');
      
      expect(MastodonMock).toHaveBeenCalledWith({
        access_token: 'test-token',
        api_url: 'https://test.mastodon/api/v1/',
      });
    });
  });

  describe('postStatus', () => {
    it('should post status successfully', async () => {
      const mockResponse = {
        data: { id: '12345' },
      };
      mockMastodonApi.post.mockResolvedValue(mockResponse);

      await client.postStatus('Test message');

      expect(mockMastodonApi.post).toHaveBeenCalledWith('statuses', {
        status: 'Test message',
      });
      expect(logger.info).toHaveBeenCalledWith('Posting status: "Test message"');
      expect(logger.info).toHaveBeenCalledWith('Status posted successfully. ID: 12345');
    });

    it('should handle post status error', async () => {
      const error = new Error('API Error');
      mockMastodonApi.post.mockRejectedValue(error);

      await expect(client.postStatus('Test message')).rejects.toThrow(
        'Failed to post status: API Error'
      );
      expect(logger.error).toHaveBeenCalledWith('Failed to post status:', error);
    });

    it('should handle unknown error', async () => {
      mockMastodonApi.post.mockRejectedValue('Unknown error');

      await expect(client.postStatus('Test message')).rejects.toThrow(
        'Failed to post status: Unknown error'
      );
    });
  });

  describe('verifyConnection', () => {
    it('should verify connection successfully', async () => {
      const mockResponse = {
        data: { username: 'testuser' },
      };
      mockMastodonApi.get.mockResolvedValue(mockResponse);

      const result = await client.verifyConnection();

      expect(result).toBe(true);
      expect(mockMastodonApi.get).toHaveBeenCalledWith('accounts/verify_credentials');
      expect(logger.debug).toHaveBeenCalledWith('Verifying Mastodon connection...');
      expect(logger.info).toHaveBeenCalledWith(
        'Connected to Mastodon as: @testuser@test.mastodon'
      );
    });

    it('should handle connection verification error', async () => {
      const error = new Error('Connection failed');
      mockMastodonApi.get.mockRejectedValue(error);

      const result = await client.verifyConnection();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Failed to verify Mastodon connection:', error);
    });
  });

  describe('getAccountInfo', () => {
    it('should get account info successfully', async () => {
      const mockAccountData = {
        username: 'testuser',
        display_name: 'Test User',
        followers_count: 100,
        following_count: 50,
      };
      const mockResponse = {
        data: mockAccountData,
      };
      mockMastodonApi.get.mockResolvedValue(mockResponse);

      const result = await client.getAccountInfo();

      expect(result).toEqual(mockAccountData);
      expect(mockMastodonApi.get).toHaveBeenCalledWith('accounts/verify_credentials');
    });

    it('should handle get account info error', async () => {
      const error = new Error('API Error');
      mockMastodonApi.get.mockRejectedValue(error);

      await expect(client.getAccountInfo()).rejects.toThrow(
        'Failed to get account info: API Error'
      );
      expect(logger.error).toHaveBeenCalledWith('Failed to get account info:', error);
    });

    it('should handle unknown error in getAccountInfo', async () => {
      mockMastodonApi.get.mockRejectedValue('Unknown error');

      await expect(client.getAccountInfo()).rejects.toThrow(
        'Failed to get account info: Unknown error'
      );
    });
  });
});