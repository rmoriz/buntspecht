import { SecretRotationDetector } from '../services/secretRotationDetector';
import { SocialMediaClient } from '../services/socialMediaClient';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/config';

interface SecretMetadata {
  accountName: string;
  fieldName: string;
  source: string;
  lastValue: string;
  lastChecked: Date;
  checkCount: number;
  lastRotationDetected?: Date;
}

// Mock dependencies
jest.mock('../services/socialMediaClient');
jest.mock('../utils/logger');
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  }),
}));

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const mockTelemetry = {
  incrementCounter: jest.fn(),
  recordHistogram: jest.fn(),
};

const mockSocialMediaClient = {
  reinitializeAccount: jest.fn(),
  verifyAccountConnection: jest.fn(),
} as unknown as SocialMediaClient;

describe('SecretRotationDetector', () => {
  let detector: SecretRotationDetector;
  let mockConfig: BotConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      accounts: [
        {
          name: 'test-mastodon',
          type: 'mastodon',
          instance: 'https://mastodon.social',
          accessTokenSource: 'vault://secret/mastodon-token',
        },
        {
          name: 'test-bluesky',
          type: 'bluesky',
          identifierSource: 'aws://bluesky-creds?key=identifier',
          passwordSource: 'aws://bluesky-creds?key=password',
        },
        {
          name: 'test-env',
          type: 'mastodon',
          instance: 'https://mastodon.social',
          accessToken: '${MASTODON_TOKEN}',
        },
        {
          name: 'test-direct',
          type: 'mastodon',
          instance: 'https://mastodon.social',
          accessToken: 'direct-token-value',
        },
      ],
      bot: {
        providers: [],
      },
      logging: {
        level: 'info' as const,
      },
    };

    detector = new SecretRotationDetector(
      mockConfig,
      mockSocialMediaClient,
      mockLogger,
      mockTelemetry,
      {
        enabled: true,
        checkInterval: '0 */15 * * * *',
        retryOnFailure: true,
        retryDelay: 60,
        maxRetries: 3,
        notifyOnRotation: true,
        testConnectionOnRotation: true,
      }
    );
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultDetector = new SecretRotationDetector(
        mockConfig,
        mockSocialMediaClient,
        mockLogger,
        mockTelemetry
      );

      const status = defaultDetector.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.checkInterval).toBe('0 */15 * * * *');
    });

    it('should identify external secret sources during initialization', async () => {
      // Mock the secret resolver to return initial values
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockResolvedValueOnce('initial-vault-token')
          .mockResolvedValueOnce('initial-aws-identifier')
          .mockResolvedValueOnce('initial-aws-password')
          .mockResolvedValueOnce('initial-env-token'),
      };

      // Replace the secret resolver in the detector
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;

      await detector.initialize();

      const status = detector.getStatus();
      expect(status.secretsMonitored).toBe(4); // vault, aws identifier, aws password, env var
    });

    it('should handle secret resolution failures during initialization', async () => {
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockResolvedValueOnce('initial-vault-token')
          .mockRejectedValueOnce(new Error('AWS secret not found'))
          .mockResolvedValueOnce('initial-aws-password')
          .mockResolvedValueOnce('initial-env-token'),
      };

      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;

      await detector.initialize();

      // Should continue with other secrets even if one fails
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve initial value for test-bluesky')
      );
    });
  });

  describe('secret source detection', () => {
    it('should identify vault:// sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('vault://secret/path');
      expect(isExternal).toBe(true);
    });

    it('should identify aws:// sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('aws://secret-name');
      expect(isExternal).toBe(true);
    });

    it('should identify azure:// sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('azure://vault/secret');
      expect(isExternal).toBe(true);
    });

    it('should identify gcp:// sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('gcp://project/secret');
      expect(isExternal).toBe(true);
    });

    it('should identify file:// sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('file:///path/to/secret');
      expect(isExternal).toBe(true);
    });

    it('should identify environment variable sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('${ENV_VAR}');
      expect(isExternal).toBe(true);
    });

    it('should not identify direct values as external sources', () => {
      const isExternal = (detector as unknown as { isExternalSecretSource: (source: string) => boolean }).isExternalSecretSource('direct-token-value');
      expect(isExternal).toBe(false);
    });
  });

  describe('secret rotation detection', () => {
    beforeEach(async () => {
      // Initialize with mock secrets
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockResolvedValue('initial-value'),
      };
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;
      await detector.initialize();
    });

    it('should detect when a secret value changes', async () => {
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockResolvedValueOnce('new-rotated-value'), // Different from initial value
      };
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;

      // Mock the metadata to have an initial value
      const metadata = {
        accountName: 'test-account',
        fieldName: 'accessToken',
        source: 'vault://secret/token',
        lastValue: 'initial-value',
        lastChecked: new Date(),
        checkCount: 0,
        lastRotationDetected: undefined as Date | undefined,
      };

      const hasRotated = await (detector as unknown as { checkSecretRotation: (metadata: SecretMetadata) => Promise<boolean> }).checkSecretRotation(metadata);
      expect(hasRotated).toBe(true);
      expect(metadata.lastValue).toBe('new-rotated-value');
      expect(metadata.lastRotationDetected).toBeDefined();
    });

    it('should not detect rotation when secret value is unchanged', async () => {
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockResolvedValueOnce('initial-value'), // Same as initial value
      };
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;

      const metadata = {
        accountName: 'test-account',
        fieldName: 'accessToken',
        source: 'vault://secret/token',
        lastValue: 'initial-value',
        lastChecked: new Date(),
        checkCount: 0,
        lastRotationDetected: undefined as Date | undefined,
      };

      const hasRotated = await (detector as unknown as { checkSecretRotation: (metadata: SecretMetadata) => Promise<boolean> }).checkSecretRotation(metadata);
      expect(hasRotated).toBe(false);
      expect(metadata.lastRotationDetected).toBeUndefined();
    });

    it('should handle secret resolution errors during rotation check', async () => {
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockRejectedValueOnce(new Error('Secret not accessible')),
      };
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;

      const metadata = {
        accountName: 'test-account',
        fieldName: 'accessToken',
        source: 'vault://secret/token',
        lastValue: 'initial-value',
        lastChecked: new Date(),
        checkCount: 0,
      };

      await expect((detector as unknown as { checkSecretRotation: (metadata: SecretMetadata) => Promise<boolean> }).checkSecretRotation(metadata))
        .rejects.toThrow('Secret not accessible');
    });
  });

  describe('secret rotation handling', () => {
    it('should update account configuration when rotation is detected', async () => {
      const metadata = {
        accountName: 'test-mastodon',
        fieldName: 'accessToken',
        source: 'vault://secret/token',
        lastValue: 'new-rotated-token',
        lastChecked: new Date(),
        checkCount: 1,
        lastRotationDetected: new Date(),
      };

      (mockSocialMediaClient.reinitializeAccount as jest.Mock).mockResolvedValueOnce(undefined);
      (mockSocialMediaClient.verifyAccountConnection as jest.Mock).mockResolvedValueOnce(true);

      await (detector as unknown as { handleSecretRotation: (metadata: SecretMetadata) => Promise<void> }).handleSecretRotation(metadata);

      expect(mockSocialMediaClient.reinitializeAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-mastodon',
          accessToken: 'new-rotated-token',
        })
      );
      expect(mockSocialMediaClient.verifyAccountConnection).toHaveBeenCalled();
      expect(mockTelemetry.incrementCounter).toHaveBeenCalledWith(
        'secret_rotation_handled',
        1,
        expect.objectContaining({
          account: 'test-mastodon',
          field: 'accessToken',
        })
      );
    });

    it('should handle account reinitialization failures', async () => {
      const metadata = {
        accountName: 'test-mastodon',
        fieldName: 'accessToken',
        source: 'vault://secret/token',
        lastValue: 'new-rotated-token',
        lastChecked: new Date(),
        checkCount: 1,
        lastRotationDetected: new Date(),
      };

      (mockSocialMediaClient.reinitializeAccount as jest.Mock)
        .mockRejectedValueOnce(new Error('Reinitialization failed'));

      await expect((detector as unknown as { handleSecretRotation: (metadata: SecretMetadata) => Promise<void> }).handleSecretRotation(metadata))
        .rejects.toThrow('Reinitialization failed');

      expect(mockTelemetry.incrementCounter).toHaveBeenCalledWith(
        'secret_rotation_handle_error',
        1,
        expect.objectContaining({
          account: 'test-mastodon',
          field: 'accessToken',
        })
      );
    });
  });

  describe('status and monitoring', () => {
    it('should provide accurate status information', () => {
      const status = detector.getStatus();
      
      expect(status).toEqual({
        enabled: true,
        running: false, // Not started yet
        secretsMonitored: 0, // Not initialized yet
        lastCheck: undefined,
        totalRotationsDetected: 0,
        checkInterval: '0 */15 * * * *',
      });
    });

    it('should provide monitored secrets information', async () => {
      // Initialize with mock secrets
      const mockSecretResolver = {
        resolveSecret: jest.fn()
          .mockResolvedValue('initial-value'),
      };
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;
      await detector.initialize();

      const monitoredSecrets = detector.getMonitoredSecrets();
      
      expect(monitoredSecrets.length).toBeGreaterThan(0);
      expect(monitoredSecrets[0]).toEqual(
        expect.objectContaining({
          accountName: expect.any(String),
          fieldName: expect.any(String),
          source: expect.any(String),
          lastChecked: expect.any(Date),
          checkCount: expect.any(Number),
        })
      );
    });

    it('should update configuration dynamically', () => {
      const newConfig = {
        enabled: false,
        checkInterval: '0 */30 * * * *',
      };

      detector.updateConfig(newConfig);
      
      const status = detector.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.checkInterval).toBe('0 */30 * * * *');
    });
  });

  describe('lifecycle management', () => {
    it('should start and stop correctly', async () => {
      // Initialize first so there are secrets to monitor
      const mockSecretResolver = {
        resolveSecret: jest.fn().mockResolvedValue('initial-value'),
      };
      (detector as unknown as { secretResolver: typeof mockSecretResolver }).secretResolver = mockSecretResolver;
      await detector.initialize();

      detector.start();
      expect(detector.getStatus().running).toBe(true);

      detector.stop();
      expect(detector.getStatus().running).toBe(false);
    });

    it('should not start if disabled', () => {
      detector.updateConfig({ enabled: false });
      detector.start();
      expect(detector.getStatus().running).toBe(false);
    });

    it('should not start if no secrets are monitored', async () => {
      // Create detector with config that has no external secrets
      const configWithoutExternalSecrets = {
        ...mockConfig,
        accounts: [
          {
            name: 'direct-only',
            type: 'mastodon' as const,
            instance: 'https://mastodon.social',
            accessToken: 'direct-token',
          },
        ],
      };

      const detectorWithoutSecrets = new SecretRotationDetector(
        configWithoutExternalSecrets,
        mockSocialMediaClient,
        mockLogger,
        mockTelemetry
      );

      await detectorWithoutSecrets.initialize();
      detectorWithoutSecrets.start();

      expect(detectorWithoutSecrets.getStatus().running).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('No external secrets found to monitor')
      );
    });
  });
});