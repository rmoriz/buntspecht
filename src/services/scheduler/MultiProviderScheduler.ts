import { SocialMediaClient } from '../socialMediaClient';
import type { TelemetryService } from '../telemetryInterface';
import { BotConfig } from '../../types/config';
import { Logger } from '../../utils/logger';
import { BaseConfigurableService } from '../baseService';
import { ProviderManager } from './ProviderManager';
import { CacheWarmer } from './CacheWarmer';
import { ExecutionEngine } from './ExecutionEngine';

/**
 * Main orchestrator for multi-provider scheduling that coordinates between
 * provider management, cache warming, and task execution
 */
export class MultiProviderScheduler extends BaseConfigurableService<BotConfig> {
  private socialMediaClient: SocialMediaClient;
  private providerManager: ProviderManager;
  private cacheWarmer: CacheWarmer;
  private executionEngine: ExecutionEngine;
  private isRunning = false;

  constructor(socialMediaClient: SocialMediaClient, config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    super(config, logger, telemetry);
    this.socialMediaClient = socialMediaClient;
    
    // Initialize components
    this.providerManager = new ProviderManager(socialMediaClient, config, logger, telemetry);
    this.cacheWarmer = new CacheWarmer(logger);
    this.executionEngine = new ExecutionEngine(
      logger, 
      telemetry, 
      socialMediaClient, 
      () => this.providerManager.getProviderConfigs()
    );
  }

  /**
   * Initializes all message providers from configuration
   */
  public async initialize(): Promise<void> {
    await this.providerManager.initialize();
    
    // Initialize middleware after providers are loaded
    await this.executionEngine.initializeMiddleware(
      () => this.providerManager.getProviderConfigs()
    );
  }

  /**
   * Starts all scheduled providers
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Multi-provider scheduler is already running');
      return;
    }

    if (this.providerManager.getScheduledProviders().length === 0) {
      await this.initialize();
    }

    this.logger.info('Starting multi-provider scheduler...');

    // Create scheduled tasks
    this.providerManager.createScheduledTasks(
      (providerName, provider) => this.executionEngine.executeProviderTask(
        providerName, 
        provider, 
        () => this.providerManager.getProviderConfigs()
      )
    );

    // Start scheduled tasks
    const { scheduledCount, pushCount } = this.providerManager.startScheduledTasks();

    this.isRunning = true;
    this.logger.info(`Multi-provider scheduler started successfully with ${scheduledCount} scheduled provider(s) and ${pushCount} push provider(s)`);
  }

  /**
   * Stops all scheduled providers
   */
  public stop(): void {
    this.logger.info('Stopping multi-provider scheduler...');

    this.providerManager.stopScheduledTasks();

    if (this.isRunning) {
      this.logger.info('Multi-provider scheduler stopped');
    } else {
      this.logger.warn('Multi-provider scheduler is not running');
      this.logger.info('Stopped cron tasks (scheduler was not running)');
    }

    this.isRunning = false;
  }

  /**
   * Executes all provider tasks immediately (for testing)
   */
  public async executeAllTasksNow(): Promise<void> {
    await this.executionEngine.executeAllTasksNow(
      this.providerManager.getScheduledProviders(),
      () => this.providerManager.getProviderConfigs()
    );
  }

  /**
   * Executes a specific provider task immediately (for testing)
   */
  public async executeProviderTaskNow(providerName: string): Promise<void> {
    await this.executionEngine.executeProviderTaskNow(
      providerName,
      this.providerManager.getScheduledProviders(),
      () => this.providerManager.getProviderConfigs()
    );
  }

  /**
   * Warms the cache for all providers that support it
   */
  public async warmCache(): Promise<void> {
    await this.cacheWarmer.warmCache(
      this.providerManager.getScheduledProviders(),
      () => this.providerManager.getProviderConfigs()
    );
  }

  /**
   * Returns whether the scheduler is currently running
   */
  public isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Returns information about all configured providers
   */
  public getProviderInfo(): Array<{name: string, type: string, schedule: string, enabled: boolean}> {
    return this.providerManager.getProviderInfo();
  }

  /**
   * Returns the names of all configured providers
   */
  public getProviderNames(): string[] {
    return this.providerManager.getProviderNames();
  }

  /**
   * Triggers a push provider with an optional custom message
   */
  public async triggerPushProvider(providerName: string, message?: string): Promise<void> {
    await this.executionEngine.triggerPushProvider(
      providerName,
      this.providerManager.getScheduledProviders(),
      () => this.providerManager.getProviderConfigs(),
      message
    );
  }

  /**
   * Triggers a push provider with message and attachments
   */
  public async triggerPushProviderWithAttachments(providerName: string, messageData: import('../../messages/messageProvider').MessageWithAttachments): Promise<void> {
    await this.executionEngine.triggerPushProviderWithAttachments(
      providerName,
      this.providerManager.getScheduledProviders(),
      () => this.providerManager.getProviderConfigs(),
      messageData
    );
  }

  /**
   * Gets all push providers
   */
  public getPushProviders(): Array<{name: string, config: unknown}> {
    return this.providerManager.getPushProviders();
  }

  /**
   * Checks if a provider is a push provider
   */
  public isPushProvider(providerName: string): boolean {
    return this.providerManager.isPushProvider(providerName);
  }

  /**
   * Gets a push provider instance by name
   */
  public getPushProvider(providerName: string): any | null {
    return this.providerManager.getPushProvider(providerName);
  }

  /**
   * Gets rate limit information for a push provider
   */
  public getPushProviderRateLimit(providerName: string): { messages: number; windowSeconds: number; currentCount: number; timeUntilReset: number } | null {
    return this.executionEngine.getPushProviderRateLimit(
      providerName,
      this.providerManager.getScheduledProviders()
    );
  }
}