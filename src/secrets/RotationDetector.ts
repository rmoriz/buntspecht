import * as cron from 'node-cron';
import { setTimeout } from 'timers';
import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';
import { SecretRotationConfig, SecretRotationEvent } from './types';
import { SecretManager } from './SecretManager';

/**
 * Detects secret rotation by periodically checking secret values
 */
export class RotationDetector {
  private logger: Logger;
  private telemetry?: TelemetryService;
  private config: SecretRotationConfig;
  private secretManager: SecretManager;
  private cronJob?: cron.ScheduledTask;
  private trackedSecrets = new Map<string, TrackedSecret>();
  private isRunning = false;

  constructor(
    config: SecretRotationConfig,
    secretManager: SecretManager,
    logger: Logger,
    telemetry?: TelemetryService
  ) {
    this.config = config;
    this.secretManager = secretManager;
    this.logger = logger;
    this.telemetry = telemetry;
  }

  /**
   * Start rotation detection
   */
  public start(): void {
    if (!this.config.enabled) {
      this.logger.debug('Secret rotation detection is disabled');
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Rotation detector is already running');
      return;
    }

    try {
      this.cronJob = cron.schedule(this.config.checkInterval, () => {
        this.checkRotations().catch(error => {
          this.logger.error('Error during rotation check:', error);
        });
      }, {
        // Don't start immediately
      });

      this.cronJob.start();
      this.isRunning = true;
      
      this.logger.info(`Secret rotation detection started with schedule: ${this.config.checkInterval}`);
    } catch (error) {
      this.logger.error('Failed to start rotation detector:', error);
      throw error;
    }
  }

  /**
   * Stop rotation detection
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = undefined;
    }
    
    this.isRunning = false;
    this.logger.info('Secret rotation detection stopped');
  }

  /**
   * Add a secret to track for rotation
   */
  public trackSecret(source: string, accountName?: string, fieldName?: string): void {
    if (!this.config.enabled) {
      return;
    }

    const tracked: TrackedSecret = {
      source,
      accountName,
      fieldName,
      lastValue: undefined,
      lastChecked: new Date(),
      rotationCount: 0,
      lastRotationDetected: undefined
    };

    this.trackedSecrets.set(source, tracked);
    this.logger.debug(`Now tracking secret for rotation: ${this.maskSource(source)}`);
  }

  /**
   * Remove a secret from tracking
   */
  public untrackSecret(source: string): boolean {
    const removed = this.trackedSecrets.delete(source);
    if (removed) {
      this.logger.debug(`Stopped tracking secret: ${this.maskSource(source)}`);
    }
    return removed;
  }

  /**
   * Get rotation statistics
   */
  public getStats(): RotationStats {
    const stats: RotationStats = {
      trackedSecrets: this.trackedSecrets.size,
      totalRotations: 0,
      recentRotations: 0,
      isRunning: this.isRunning,
      lastCheck: undefined,
      nextCheck: undefined
    };

    // Calculate total rotations
    for (const tracked of this.trackedSecrets.values()) {
      stats.totalRotations += tracked.rotationCount;
      
      // Count recent rotations (last 24 hours)
      if (tracked.lastRotationDetected) {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (tracked.lastRotationDetected > dayAgo) {
          stats.recentRotations++;
        }
      }
    }

    // Get last check time
    let lastCheck: Date | undefined;
    for (const tracked of this.trackedSecrets.values()) {
      if (!lastCheck || tracked.lastChecked > lastCheck) {
        lastCheck = tracked.lastChecked;
      }
    }
    stats.lastCheck = lastCheck;

    return stats;
  }

  /**
   * Get list of tracked secrets (masked for security)
   */
  public getTrackedSecrets(): string[] {
    return Array.from(this.trackedSecrets.keys()).map(source => this.maskSource(source));
  }

  /**
   * Manually trigger a rotation check
   */
  public async checkRotations(): Promise<void> {
    if (this.trackedSecrets.size === 0) {
      this.logger.debug('No secrets to check for rotation');
      return;
    }

    const span = this.telemetry?.startSpan('secret.rotation_check', {
      'rotation.tracked_secrets': this.trackedSecrets.size,
    });

    let checkedCount = 0;
    const rotationsDetected = 0;
    let errors = 0;

    this.logger.debug(`Checking ${this.trackedSecrets.size} secrets for rotation`);

    for (const [source, tracked] of this.trackedSecrets.entries()) {
      try {
        await this.checkSecretRotation(source, tracked);
        checkedCount++;
      } catch (error) {
        errors++;
        this.logger.error(`Failed to check rotation for secret ${this.maskSource(source)}:`, error);
        
        // Handle retry logic
        if (this.config.retryOnFailure && (tracked.retryCount || 0) < this.config.maxRetries) {
          tracked.retryCount = (tracked.retryCount || 0) + 1;
          this.logger.debug(`Will retry checking secret ${this.maskSource(source)} (attempt ${tracked.retryCount}/${this.config.maxRetries})`);
          
          // Schedule retry
          setTimeout(() => {
            this.checkSecretRotation(source, tracked).catch(retryError => {
              this.logger.error(`Retry failed for secret ${this.maskSource(source)}:`, retryError);
            });
          }, this.config.retryDelay * 1000);
        }
      }
    }

    span?.setAttributes({
      'rotation.checked_count': checkedCount,
      'rotation.rotations_detected': rotationsDetected,
      'rotation.errors': errors,
    });
    span?.setStatus({ code: errors > 0 ? 2 : 1 }); // ERROR if errors, OK otherwise
    span?.end();

    this.logger.debug(`Rotation check completed: ${checkedCount} checked, ${rotationsDetected} rotations detected, ${errors} errors`);
  }

  /**
   * Check a single secret for rotation
   */
  private async checkSecretRotation(source: string, tracked: TrackedSecret): Promise<void> {
    try {
      // Get current secret value
      const result = await this.secretManager.resolve(source);
      const currentValue = result.value;
      
      tracked.lastChecked = new Date();
      tracked.retryCount = 0; // Reset retry count on success
      
      // Check if this is the first time we're checking this secret
      if (tracked.lastValue === undefined) {
        tracked.lastValue = currentValue;
        this.logger.debug(`Initial value recorded for secret: ${this.maskSource(source)}`);
        return;
      }
      
      // Check if value has changed (rotation detected)
      if (currentValue !== tracked.lastValue) {
        const rotationEvent: SecretRotationEvent = {
          source,
          provider: result.metadata.provider,
          oldValue: tracked.lastValue,
          newValue: currentValue,
          detectedAt: new Date(),
          accountName: tracked.accountName,
          fieldName: tracked.fieldName
        };
        
        tracked.lastValue = currentValue;
        tracked.rotationCount++;
        tracked.lastRotationDetected = rotationEvent.detectedAt;
        
        this.logger.info(`Secret rotation detected for: ${this.maskSource(source)}`);
        
        // Emit rotation event
        await this.handleRotationEvent(rotationEvent);
      }
      
    } catch (error) {
      this.logger.error(`Failed to check secret rotation for ${this.maskSource(source)}:`, error);
      throw error;
    }
  }

  /**
   * Handle a detected rotation event
   */
  private async handleRotationEvent(event: SecretRotationEvent): Promise<void> {
    const span = this.telemetry?.startSpan('secret.rotation_detected', {
      'rotation.source': this.maskSource(event.source),
      'rotation.provider': event.provider,
      'rotation.account_name': event.accountName || 'unknown',
      'rotation.field_name': event.fieldName || 'unknown',
    });

    try {
      // Log the rotation
      this.logger.info(`Secret rotation detected: ${this.maskSource(event.source)} (provider: ${event.provider})`);
      
      // Test connection with new secret if configured
      if (this.config.testConnectionOnRotation) {
        this.logger.debug('Testing connection with rotated secret...');
        // This would require integration with the social media client
        // For now, just log that we would test
        this.logger.debug('Connection test with rotated secret would be performed here');
      }
      
      // Clear cache for this secret to force refresh
      this.secretManager.clearCache(event.source);
      
      // Record telemetry
      span?.setAttributes({
        'rotation.success': true,
      });
      span?.setStatus({ code: 1 }); // OK
      
    } catch (error) {
      this.logger.error('Error handling rotation event:', error);
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Mask sensitive parts of the source for logging
   */
  private maskSource(source: string): string {
    try {
      const url = new URL(source);
      return `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch {
      // Not a URL, mask the middle part
      if (source.length > 10) {
        return source.substring(0, 5) + '***' + source.substring(source.length - 5);
      }
      return '***';
    }
  }
}

/**
 * Internal structure for tracking secrets
 */
interface TrackedSecret {
  source: string;
  accountName?: string;
  fieldName?: string;
  lastValue?: string;
  lastChecked: Date;
  rotationCount: number;
  lastRotationDetected?: Date;
  retryCount?: number;
}

/**
 * Rotation detection statistics
 */
export interface RotationStats {
  trackedSecrets: number;
  totalRotations: number;
  recentRotations: number;
  isRunning: boolean;
  lastCheck?: Date;
  nextCheck?: Date;
}