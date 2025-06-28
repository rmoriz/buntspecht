import * as cron from 'node-cron';
import { MastodonClient } from './mastodonClient';
import { BotConfig, ProviderConfig } from '../types/config';
import { Logger } from '../utils/logger';
import { MessageProvider } from '../messages/messageProvider';
import { MessageProviderFactory } from '../messages/messageProviderFactory';

interface ScheduledProvider {
  name: string;
  provider: MessageProvider;
  task: cron.ScheduledTask;
  config: ProviderConfig;
}

export class MultiProviderScheduler {
  private mastodonClient: MastodonClient;
  private config: BotConfig;
  private logger: Logger;
  private scheduledProviders: ScheduledProvider[] = [];
  private isRunning = false;

  constructor(mastodonClient: MastodonClient, config: BotConfig, logger: Logger) {
    this.mastodonClient = mastodonClient;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initializes all message providers from configuration
   */
  public async initialize(): Promise<void> {
    const providers = this.getProviderConfigs();
    
    if (providers.length === 0) {
      throw new Error('No providers configured. Please configure at least one provider.');
    }

    this.logger.info(`Initializing ${providers.length} provider(s)...`);

    for (const providerConfig of providers) {
      if (providerConfig.enabled === false) {
        this.logger.info(`Skipping disabled provider: ${providerConfig.name}`);
        continue;
      }

      try {
        await this.initializeProvider(providerConfig);
      } catch (error) {
        this.logger.error(`Failed to initialize provider "${providerConfig.name}":`, error);
        throw error;
      }
    }

    this.logger.info(`Successfully initialized ${this.scheduledProviders.length} provider(s)`);
  }

  /**
   * Initializes a single provider
   */
  private async initializeProvider(providerConfig: ProviderConfig): Promise<void> {
    this.logger.debug(`Initializing provider: ${providerConfig.name} (${providerConfig.type})`);

    // Validate cron schedule
    if (!cron.validate(providerConfig.cronSchedule)) {
      throw new Error(`Invalid cron schedule for provider "${providerConfig.name}": ${providerConfig.cronSchedule}`);
    }

    // Create message provider
    const messageProvider = await MessageProviderFactory.createProvider(
      providerConfig.type,
      providerConfig.config,
      this.logger
    );

    // Create scheduled task
    const task = cron.schedule(providerConfig.cronSchedule, async () => {
      await this.executeProviderTask(providerConfig.name, messageProvider);
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.scheduledProviders.push({
      name: providerConfig.name,
      provider: messageProvider,
      task,
      config: providerConfig
    });

    this.logger.info(`Initialized provider "${providerConfig.name}" with schedule: ${providerConfig.cronSchedule}`);
  }

  /**
   * Gets provider configurations from bot config, handling both legacy and new formats
   */
  private getProviderConfigs(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];

    // Handle new multi-provider configuration first (takes precedence)
    if (this.config.bot.providers && this.config.bot.providers.length > 0) {
      providers.push(...this.config.bot.providers);
      return providers; // Return early to avoid legacy processing
    }

    // Handle legacy single-provider configuration for backward compatibility
    if (this.config.bot.messageProvider || this.config.bot.cronSchedule) {
      const legacyProvider: ProviderConfig = {
        name: 'legacy-provider',
        type: this.config.bot.messageProvider || 'ping',
        cronSchedule: this.config.bot.cronSchedule || '0 * * * *',
        enabled: true,
        config: this.config.bot.messageProviderConfig || { message: this.config.bot.message || 'PING' }
      };
      providers.push(legacyProvider);
      
      this.logger.warn('Using legacy single-provider configuration. Consider migrating to the new multi-provider format.');
    }

    return providers;
  }

  /**
   * Starts all scheduled providers
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Multi-provider scheduler is already running');
      return;
    }

    if (this.scheduledProviders.length === 0) {
      await this.initialize();
    }

    this.logger.info('Starting multi-provider scheduler...');

    for (const scheduledProvider of this.scheduledProviders) {
      scheduledProvider.task.start();
      this.logger.info(`Started provider "${scheduledProvider.name}" with schedule: ${scheduledProvider.config.cronSchedule}`);
    }

    this.isRunning = true;
    this.logger.info(`Multi-provider scheduler started successfully with ${this.scheduledProviders.length} provider(s)`);
  }

  /**
   * Stops all scheduled providers
   */
  public stop(): void {
    if (!this.isRunning) {
      this.logger.warn('Multi-provider scheduler is not running');
      return;
    }

    this.logger.info('Stopping multi-provider scheduler...');

    for (const scheduledProvider of this.scheduledProviders) {
      scheduledProvider.task.stop();
      this.logger.debug(`Stopped provider: ${scheduledProvider.name}`);
    }

    this.isRunning = false;
    this.logger.info('Multi-provider scheduler stopped');
  }

  /**
   * Executes a task for a specific provider
   */
  private async executeProviderTask(providerName: string, provider: MessageProvider): Promise<void> {
    try {
      this.logger.debug(`Executing task for provider: ${providerName}`);
      const message = await provider.generateMessage();
      await this.mastodonClient.postStatus(message);
      this.logger.info(`Successfully posted message from provider: ${providerName}`);
    } catch (error) {
      this.logger.error(`Failed to execute task for provider "${providerName}":`, error);
      // Don't throw here to prevent other providers from being affected
    }
  }

  /**
   * Executes all provider tasks immediately (for testing)
   */
  public async executeAllTasksNow(): Promise<void> {
    this.logger.info('Executing all provider tasks immediately...');
    
    for (const scheduledProvider of this.scheduledProviders) {
      await this.executeProviderTask(scheduledProvider.name, scheduledProvider.provider);
    }
  }

  /**
   * Executes a specific provider task immediately (for testing)
   */
  public async executeProviderTaskNow(providerName: string): Promise<void> {
    const scheduledProvider = this.scheduledProviders.find(sp => sp.name === providerName);
    
    if (!scheduledProvider) {
      throw new Error(`Provider "${providerName}" not found`);
    }

    this.logger.info(`Executing task for provider "${providerName}" immediately...`);
    await this.executeProviderTask(scheduledProvider.name, scheduledProvider.provider);
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
    return this.scheduledProviders.map(sp => ({
      name: sp.name,
      type: sp.provider.getProviderName(),
      schedule: sp.config.cronSchedule,
      enabled: sp.config.enabled !== false
    }));
  }

  /**
   * Returns the names of all configured providers
   */
  public getProviderNames(): string[] {
    return this.scheduledProviders.map(sp => sp.name);
  }
}