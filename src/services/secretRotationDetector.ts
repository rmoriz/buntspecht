import { Logger } from '../utils/logger';
import { SecretResolver } from './secretResolver';
import { BotConfig, AccountConfig } from '../types/config';
import { SocialMediaClient } from './socialMediaClient';
import * as cron from 'node-cron';

/**
 * Interface for tracking secret metadata
 */
interface SecretMetadata {
  accountName: string;
  fieldName: string;
  source: string;
  lastValue: string;
  lastChecked: Date;
  checkCount: number;
  lastRotationDetected?: Date;
}

/**
 * Configuration for secret rotation detection
 */
export interface SecretRotationConfig {
  enabled: boolean;
  checkInterval: string; // Cron expression, default: "0 */15 * * * *" (every 15 minutes)
  retryOnFailure: boolean;
  retryDelay: number; // seconds
  maxRetries: number;
  notifyOnRotation: boolean;
  testConnectionOnRotation: boolean;
}

/**
 * Service for detecting and handling automatic secret rotation
 */
export class SecretRotationDetector {
  private logger: Logger;
  private secretResolver: SecretResolver;
  private config: BotConfig;
  private socialMediaClient: SocialMediaClient;
  private rotationConfig: SecretRotationConfig;
  private secretMetadata: Map<string, SecretMetadata> = new Map();
  private cronJob?: cron.ScheduledTask;
  private isRunning = false;
  private telemetry: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(
    config: BotConfig,
    socialMediaClient: SocialMediaClient,
    logger: Logger,
    telemetry: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    rotationConfig?: Partial<SecretRotationConfig>
  ) {
    this.config = config;
    this.socialMediaClient = socialMediaClient;
    this.logger = logger;
    this.telemetry = telemetry;
    this.secretResolver = new SecretResolver(logger);

    // Default configuration
    this.rotationConfig = {
      enabled: true,
      checkInterval: "0 */15 * * * *", // Every 15 minutes
      retryOnFailure: true,
      retryDelay: 60, // 1 minute
      maxRetries: 3,
      notifyOnRotation: true,
      testConnectionOnRotation: true,
      ...rotationConfig
    };

    this.logger.info('Secret rotation detector initialized', {
      enabled: this.rotationConfig.enabled,
      checkInterval: this.rotationConfig.checkInterval
    });
  }

  /**
   * Initialize the secret rotation detector
   */
  public async initialize(): Promise<void> {
    if (!this.rotationConfig.enabled) {
      this.logger.info('Secret rotation detection is disabled');
      return;
    }

    // Scan configuration for external secret sources
    await this.scanConfigurationForSecrets();

    this.logger.info(`Secret rotation detector initialized with ${this.secretMetadata.size} external secrets to monitor`);
  }

  /**
   * Start the secret rotation detection service
   */
  public start(): void {
    if (!this.rotationConfig.enabled || this.isRunning) {
      return;
    }

    if (this.secretMetadata.size === 0) {
      this.logger.info('No external secrets found to monitor, secret rotation detection will not start');
      return;
    }

    this.cronJob = cron.schedule(this.rotationConfig.checkInterval, async () => {
      await this.checkForSecretRotations();
    }, {
      scheduled: false
    });

    this.cronJob.start();
    this.isRunning = true;

    this.logger.info(`Secret rotation detection started with interval: ${this.rotationConfig.checkInterval}`);
    
    // Record telemetry
    if (this.telemetry?.incrementCounter) {
      this.telemetry.incrementCounter('secret_rotation_detector_started', 1, {
        secrets_monitored: this.secretMetadata.size.toString(),
        check_interval: this.rotationConfig.checkInterval
      });
    }
  }

  /**
   * Stop the secret rotation detection service
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = undefined;
    }

    this.isRunning = false;
    this.logger.info('Secret rotation detection stopped');

    // Record telemetry
    if (this.telemetry?.incrementCounter) {
      this.telemetry.incrementCounter('secret_rotation_detector_stopped', 1);
    }
  }

  /**
   * Manually trigger a check for secret rotations
   */
  public async checkForSecretRotations(): Promise<void> {
    if (this.secretMetadata.size === 0) {
      return;
    }

    this.logger.debug('Checking for secret rotations...');
    
    const startTime = Date.now();
    let rotationsDetected = 0;
    let checkErrors = 0;

    for (const [, metadata] of this.secretMetadata) {
      try {
        const hasRotated = await this.checkSecretRotation(metadata);
        if (hasRotated) {
          rotationsDetected++;
          await this.handleSecretRotation(metadata);
        }
      } catch (error) {
        checkErrors++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to check secret rotation for ${metadata.accountName}.${metadata.fieldName}: ${errorMessage}`);
        
        // Record telemetry for errors
        if (this.telemetry?.incrementCounter) {
          this.telemetry.incrementCounter('secret_rotation_check_error', 1, {
            account: metadata.accountName,
            field: metadata.fieldName
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    
    this.logger.debug(`Secret rotation check completed in ${duration}ms`, {
      secretsChecked: this.secretMetadata.size,
      rotationsDetected,
      checkErrors
    });

    // Record telemetry
    if (this.telemetry?.recordHistogram) {
      this.telemetry.recordHistogram('secret_rotation_check_duration', duration, {
        secrets_checked: this.secretMetadata.size.toString(),
        rotations_detected: rotationsDetected.toString(),
        check_errors: checkErrors.toString()
      });
    }
  }

  /**
   * Check if a specific secret has been rotated
   */
  private async checkSecretRotation(metadata: SecretMetadata): Promise<boolean> {
    try {
      const currentValue = await this.secretResolver.resolveSecret(metadata.source);
      
      // Update metadata
      metadata.lastChecked = new Date();
      metadata.checkCount++;

      // Compare with last known value
      if (currentValue !== metadata.lastValue) {
        this.logger.info(`Secret rotation detected for ${metadata.accountName}.${metadata.fieldName}`);
        
        // Update metadata with new value
        metadata.lastValue = currentValue;
        metadata.lastRotationDetected = new Date();
        
        return true;
      }

      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to resolve secret for rotation check: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Handle a detected secret rotation
   */
  private async handleSecretRotation(metadata: SecretMetadata): Promise<void> {
    this.logger.info(`Handling secret rotation for ${metadata.accountName}.${metadata.fieldName}`);

    try {
      // Update the account configuration with the new secret value
      await this.updateAccountSecret(metadata);

      // Test connection if configured
      if (this.rotationConfig.testConnectionOnRotation) {
        await this.testAccountConnection(metadata.accountName);
      }

      // Notify about rotation if configured
      if (this.rotationConfig.notifyOnRotation) {
        this.notifySecretRotation(metadata);
      }

      // Record telemetry
      if (this.telemetry?.incrementCounter) {
        this.telemetry.incrementCounter('secret_rotation_handled', 1, {
          account: metadata.accountName,
          field: metadata.fieldName
        });
      }

      this.logger.info(`Successfully handled secret rotation for ${metadata.accountName}.${metadata.fieldName}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to handle secret rotation for ${metadata.accountName}.${metadata.fieldName}: ${errorMessage}`);
      
      // Record telemetry for errors
      if (this.telemetry?.incrementCounter) {
        this.telemetry.incrementCounter('secret_rotation_handle_error', 1, {
          account: metadata.accountName,
          field: metadata.fieldName
        });
      }

      throw error;
    }
  }

  /**
   * Update account configuration with new secret value
   */
  private async updateAccountSecret(metadata: SecretMetadata): Promise<void> {
    const account = this.config.accounts.find(acc => acc.name === metadata.accountName);
    if (!account) {
      throw new Error(`Account ${metadata.accountName} not found in configuration`);
    }

    // Update the account field with the new secret value
    switch (metadata.fieldName) {
      case 'accessToken':
        account.accessToken = metadata.lastValue;
        break;
      case 'password':
        account.password = metadata.lastValue;
        break;
      case 'identifier':
        account.identifier = metadata.lastValue;
        break;
      case 'instance':
        account.instance = metadata.lastValue;
        break;
      default:
        throw new Error(`Unknown secret field: ${metadata.fieldName}`);
    }

    // Reinitialize the social media client for this account
    await this.socialMediaClient.reinitializeAccount(account);

    this.logger.debug(`Updated ${metadata.fieldName} for account ${metadata.accountName}`);
  }

  /**
   * Test connection for a specific account after secret rotation
   */
  private async testAccountConnection(accountName: string): Promise<void> {
    try {
      const account = this.config.accounts.find(acc => acc.name === accountName);
      if (!account) {
        throw new Error(`Account ${accountName} not found`);
      }

      const isConnected = await this.socialMediaClient.verifyAccountConnection(account);
      if (!isConnected) {
        throw new Error(`Connection test failed for account ${accountName} after secret rotation`);
      }

      this.logger.info(`Connection test successful for account ${accountName} after secret rotation`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection test failed for account ${accountName}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Notify about secret rotation
   */
  private notifySecretRotation(metadata: SecretMetadata): void {
    this.logger.info(`🔄 Secret rotated for ${metadata.accountName}.${metadata.fieldName} at ${metadata.lastRotationDetected?.toISOString()}`);
    
    // Could be extended to send notifications via webhook, email, etc.
  }

  /**
   * Scan configuration for external secret sources
   */
  private async scanConfigurationForSecrets(): Promise<void> {
    for (const account of this.config.accounts) {
      await this.scanAccountForSecrets(account);
    }
  }

  /**
   * Scan a single account for external secret sources
   */
  private async scanAccountForSecrets(account: AccountConfig): Promise<void> {
    const fieldsToCheck = [
      { field: 'accessToken', source: account.accessTokenSource },
      { field: 'password', source: account.passwordSource },
      { field: 'identifier', source: account.identifierSource },
      { field: 'instance', source: account.instanceSource }
    ];

    for (const { field, source } of fieldsToCheck) {
      if (source && this.isExternalSecretSource(source)) {
        try {
          // Get initial value
          const initialValue = await this.secretResolver.resolveSecret(source);
          
          const key = `${account.name}.${field}`;
          const metadata: SecretMetadata = {
            accountName: account.name,
            fieldName: field,
            source: source,
            lastValue: initialValue,
            lastChecked: new Date(),
            checkCount: 0
          };

          this.secretMetadata.set(key, metadata);
          
          this.logger.debug(`Registered external secret for monitoring: ${account.name}.${field} (${source})`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Failed to resolve initial value for ${account.name}.${field}: ${errorMessage}`);
        }
      }

      // Also check direct values that might be environment variable references
      const directValue = (account as any)[field];
      if (directValue && this.isExternalSecretSource(directValue)) {
        try {
          const initialValue = await this.secretResolver.resolveSecret(directValue);
          
          const key = `${account.name}.${field}`;
          const metadata: SecretMetadata = {
            accountName: account.name,
            fieldName: field,
            source: directValue,
            lastValue: initialValue,
            lastChecked: new Date(),
            checkCount: 0
          };

          this.secretMetadata.set(key, metadata);
          
          this.logger.debug(`Registered external secret for monitoring: ${account.name}.${field} (${directValue})`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Failed to resolve initial value for ${account.name}.${field}: ${errorMessage}`);
        }
      }
    }
  }

  /**
   * Check if a value is an external secret source
   */
  private isExternalSecretSource(value: string): boolean {
    return value.startsWith('${') || // Environment variables
           value.startsWith('file://') || // File-based secrets
           value.startsWith('vault://') || // HashiCorp Vault
           value.startsWith('aws://') || // AWS Secrets Manager
           value.startsWith('azure://') || // Azure Key Vault
           value.startsWith('gcp://'); // Google Cloud Secret Manager
  }

  /**
   * Get current status and statistics
   */
  public getStatus(): {
    enabled: boolean;
    running: boolean;
    secretsMonitored: number;
    lastCheck?: Date;
    totalRotationsDetected: number;
    checkInterval: string;
  } {
    const totalRotationsDetected = Array.from(this.secretMetadata.values())
      .filter(metadata => metadata.lastRotationDetected).length;

    const lastCheck = Array.from(this.secretMetadata.values())
      .reduce((latest, metadata) => {
        return !latest || metadata.lastChecked > latest ? metadata.lastChecked : latest;
      }, undefined as Date | undefined);

    return {
      enabled: this.rotationConfig.enabled,
      running: this.isRunning,
      secretsMonitored: this.secretMetadata.size,
      lastCheck,
      totalRotationsDetected,
      checkInterval: this.rotationConfig.checkInterval
    };
  }

  /**
   * Get detailed information about monitored secrets
   */
  public getMonitoredSecrets(): Array<{
    accountName: string;
    fieldName: string;
    source: string;
    lastChecked: Date;
    checkCount: number;
    lastRotationDetected?: Date;
  }> {
    return Array.from(this.secretMetadata.values()).map(metadata => ({
      accountName: metadata.accountName,
      fieldName: metadata.fieldName,
      source: metadata.source,
      lastChecked: metadata.lastChecked,
      checkCount: metadata.checkCount,
      lastRotationDetected: metadata.lastRotationDetected
    }));
  }

  /**
   * Update rotation configuration
   */
  public updateConfig(newConfig: Partial<SecretRotationConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.rotationConfig = { ...this.rotationConfig, ...newConfig };

    if (wasRunning && this.rotationConfig.enabled) {
      this.start();
    }

    this.logger.info('Secret rotation detector configuration updated', this.rotationConfig);
  }
}