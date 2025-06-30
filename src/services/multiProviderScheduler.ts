import * as cron from 'node-cron';
import { MastodonClient } from './mastodonClient';
import type { TelemetryService } from './telemetryInterface';
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
  private telemetry: TelemetryService;
  private scheduledProviders: ScheduledProvider[] = [];
  private isRunning = false;

  constructor(mastodonClient: MastodonClient, config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    this.mastodonClient = mastodonClient;
    this.config = config;
    this.logger = logger;
    this.telemetry = telemetry;
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

    // Validate accounts
    if (!providerConfig.accounts || providerConfig.accounts.length === 0) {
      throw new Error(`Provider "${providerConfig.name}" must specify at least one account`);
    }

    // Validate that all specified accounts exist in configuration
    for (const accountName of providerConfig.accounts) {
      if (!this.mastodonClient.hasAccount(accountName)) {
        throw new Error(`Provider "${providerConfig.name}" references unknown account: "${accountName}"`);
      }
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

    this.logger.info(`Initialized provider "${providerConfig.name}" with schedule: ${providerConfig.cronSchedule} for accounts: ${providerConfig.accounts.join(', ')}`);
  }

  /**
   * Gets provider configurations from bot config
   */
  private getProviderConfigs(): ProviderConfig[] {
    return this.config.bot.providers || [];
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
    const startTime = Date.now();
    const span = this.telemetry.startSpan('provider.execute_task', {
      'provider.name': providerName,
      'provider.type': provider.getProviderName(),
    });

    try {
      this.logger.debug(`Executing task for provider: ${providerName}`);
      
      // Find the provider config to get account names
      const providerConfig = this.getProviderConfigs().find(p => p.name === providerName);
      if (!providerConfig) {
        throw new Error(`Provider configuration not found for: ${providerName}`);
      }

      span?.setAttributes({
        'provider.accounts_count': providerConfig.accounts.length,
        'provider.accounts': providerConfig.accounts.join(','),
      });

      const message = await provider.generateMessage();
      span?.setAttributes({
        'provider.message_length': message.length,
      });

      await this.mastodonClient.postStatus(message, providerConfig.accounts, providerName);
      
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.telemetry.recordProviderExecution(providerName, durationSeconds);
      
      this.logger.info(`Successfully posted message from provider: ${providerName}`);
      span?.setStatus({ code: 1 }); // OK
    } catch (error) {
      this.logger.error(`Failed to execute task for provider "${providerName}":`, error);
      this.telemetry.recordError('provider_execution_failed', providerName);
      span?.recordException(error as Error);
      span?.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      // Don't throw here to prevent other providers from being affected
    } finally {
      span?.end();
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