import * as cron from 'node-cron';
import { SocialMediaClient } from './socialMediaClient';
import type { TelemetryService } from './telemetryInterface';
import { BotConfig, ProviderConfig } from '../types/config';
import { Logger } from '../utils/logger';
import { MessageProvider } from '../messages/messageProvider';
import { MessageProviderFactory } from '../messages/messageProviderFactory';
import { PushProviderInterface } from '../messages/pushProvider';

interface ScheduledProvider {
  name: string;
  provider: MessageProvider;
  task?: cron.ScheduledTask; // Optional for push providers
  config: ProviderConfig;
}

export class MultiProviderScheduler {
  private socialMediaClient: SocialMediaClient;
  private config: BotConfig;
  private logger: Logger;
  private telemetry: TelemetryService;
  private scheduledProviders: ScheduledProvider[] = [];
  private isRunning = false;

  constructor(socialMediaClient: SocialMediaClient, config: BotConfig, logger: Logger, telemetry: TelemetryService) {
    this.socialMediaClient = socialMediaClient;
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

    // Check if this is a push provider (no cron schedule)
    const isPushProvider = providerConfig.type.toLowerCase() === 'push' || !providerConfig.cronSchedule;

    // Validate cron schedule for non-push providers
    if (!isPushProvider) {
      if (!cron.validate(providerConfig.cronSchedule!)) {
        throw new Error(`Invalid cron schedule for provider "${providerConfig.name}": ${providerConfig.cronSchedule}`);
      }
    }

    // Validate accounts
    if (!providerConfig.accounts || providerConfig.accounts.length === 0) {
      throw new Error(`Provider "${providerConfig.name}" must specify at least one account`);
    }

    // Validate that all specified accounts exist in configuration
    for (const accountName of providerConfig.accounts) {
      if (!this.socialMediaClient.hasAccount(accountName)) {
        throw new Error(`Provider "${providerConfig.name}" references unknown account: "${accountName}"`);
      }
    }

    // Create message provider
    const messageProvider = await MessageProviderFactory.createProvider(
      providerConfig.type,
      providerConfig.config,
      this.logger,
      this.telemetry,
      providerConfig.name
    );

    let task: cron.ScheduledTask | undefined;

    // Create scheduled task only for non-push providers
    if (!isPushProvider) {
      task = cron.schedule(providerConfig.cronSchedule!, async () => {
        await this.executeProviderTask(providerConfig.name, messageProvider);
      }, {
        scheduled: false,
        timezone: 'UTC'
      });
    }

    this.scheduledProviders.push({
      name: providerConfig.name,
      provider: messageProvider,
      task,
      config: providerConfig
    });

    if (isPushProvider) {
      this.logger.info(`Initialized push provider "${providerConfig.name}" for accounts: ${providerConfig.accounts.join(', ')}`);
    } else {
      this.logger.info(`Initialized provider "${providerConfig.name}" with schedule: ${providerConfig.cronSchedule} for accounts: ${providerConfig.accounts.join(', ')}`);
    }
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

    let scheduledCount = 0;
    let pushCount = 0;

    for (const scheduledProvider of this.scheduledProviders) {
      if (scheduledProvider.task) {
        scheduledProvider.task.start();
        this.logger.info(`Started provider "${scheduledProvider.name}" with schedule: ${scheduledProvider.config.cronSchedule}`);
        scheduledCount++;
      } else {
        this.logger.info(`Push provider "${scheduledProvider.name}" ready for external triggers`);
        pushCount++;
      }
    }

    this.isRunning = true;
    this.logger.info(`Multi-provider scheduler started successfully with ${scheduledCount} scheduled provider(s) and ${pushCount} push provider(s)`);
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
      if (scheduledProvider.task) {
        scheduledProvider.task.stop();
        this.logger.debug(`Stopped provider: ${scheduledProvider.name}`);
      }
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

      // Check if message is empty - if so, skip posting
      if (!message || message.trim() === '') {
        this.logger.info(`Provider "${providerName}" generated empty message, skipping post`);
        span?.setStatus({ code: 1 }); // OK
        return;
      }

      // Determine visibility: push provider specific > provider config > default (unlisted)
      let finalVisibility = providerConfig.visibility;
      if (provider.getProviderName() === 'push') {
        const pushProvider = provider as MessageProvider & PushProviderInterface;
        if (typeof pushProvider.getVisibility === 'function') {
          const pushVisibility = pushProvider.getVisibility();
          if (pushVisibility) {
            finalVisibility = pushVisibility;
          }
        }
      }

      await this.socialMediaClient.postStatus(message, providerConfig.accounts, providerName, finalVisibility);
      
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
      schedule: sp.config.cronSchedule || 'push (external trigger)',
      enabled: sp.config.enabled !== false
    }));
  }

  /**
   * Returns the names of all configured providers
   */
  public getProviderNames(): string[] {
    return this.scheduledProviders.map(sp => sp.name);
  }

  /**
   * Triggers a push provider with an optional custom message
   * @param providerName Name of the push provider to trigger
   * @param message Optional custom message to post
   */
  public async triggerPushProvider(providerName: string, message?: string): Promise<void> {
    const scheduledProvider = this.scheduledProviders.find(sp => sp.name === providerName);
    
    if (!scheduledProvider) {
      throw new Error(`Provider "${providerName}" not found`);
    }

    if (scheduledProvider.provider.getProviderName() !== 'push') {
      throw new Error(`Provider "${providerName}" is not a push provider`);
    }

    // Cast to PushProvider to access push-specific methods
    const pushProvider = scheduledProvider.provider as MessageProvider & PushProviderInterface;
    
    // Check rate limiting
    if (typeof pushProvider.isRateLimited === 'function' && pushProvider.isRateLimited()) {
      const timeUntilNext = typeof pushProvider.getTimeUntilNextMessage === 'function' 
        ? pushProvider.getTimeUntilNextMessage() 
        : 0;
      
      const rateLimitInfo = typeof pushProvider.getRateLimitInfo === 'function' 
        ? pushProvider.getRateLimitInfo() 
        : { messages: 1, windowSeconds: 60, currentCount: 1, timeUntilReset: timeUntilNext };
      
      // Record rate limit hit in telemetry
      this.telemetry.recordRateLimitHit(providerName, rateLimitInfo.currentCount, rateLimitInfo.messages);
      
      this.logger.warn(`Push provider "${providerName}" is rate limited. ` +
        `Current: ${rateLimitInfo.currentCount}/${rateLimitInfo.messages} messages in ${rateLimitInfo.windowSeconds}s window. ` +
        `Next message allowed in ${timeUntilNext} seconds.`);
      
      throw new Error(`Push provider "${providerName}" is rate limited. Next message allowed in ${timeUntilNext} seconds.`);
    }
    
    if (message && typeof pushProvider.setMessage === 'function') {
      pushProvider.setMessage(message);
      this.logger.debug(`Set custom message for push provider "${providerName}": "${message}"`);
    }

    this.logger.info(`Triggering push provider "${providerName}"${message ? ' with custom message' : ''}`);
    
    // Execute the task
    await this.executeProviderTask(scheduledProvider.name, scheduledProvider.provider);
    
    // Record the message send for rate limiting
    if (typeof pushProvider.recordMessageSent === 'function') {
      pushProvider.recordMessageSent();
      
      // Update rate limit usage telemetry
      const rateLimitInfo = typeof pushProvider.getRateLimitInfo === 'function' 
        ? pushProvider.getRateLimitInfo() 
        : { messages: 1, windowSeconds: 60, currentCount: 1, timeUntilReset: 0 };
      
      this.telemetry.updateRateLimitUsage(providerName, rateLimitInfo.currentCount, rateLimitInfo.messages);
    }
  }

  /**
   * Gets all push providers
   */
  public getPushProviders(): Array<{name: string, config: unknown}> {
    return this.scheduledProviders
      .filter(sp => sp.provider.getProviderName() === 'push')
      .map(sp => ({
        name: sp.name,
        config: (sp.provider as MessageProvider & PushProviderInterface).getConfig ? (sp.provider as MessageProvider & PushProviderInterface).getConfig() : {}
      }));
  }

  /**
   * Checks if a provider is a push provider
   */
  public isPushProvider(providerName: string): boolean {
    const scheduledProvider = this.scheduledProviders.find(sp => sp.name === providerName);
    return scheduledProvider?.provider.getProviderName() === 'push' || false;
  }

  /**
   * Gets a push provider instance by name
   */
  public getPushProvider(providerName: string): (MessageProvider & PushProviderInterface) | null {
    const scheduledProvider = this.scheduledProviders.find(sp => sp.name === providerName);
    if (scheduledProvider?.provider.getProviderName() === 'push') {
      return scheduledProvider.provider as MessageProvider & PushProviderInterface;
    }
    return null;
  }

  /**
   * Gets rate limit information for a push provider
   */
  public getPushProviderRateLimit(providerName: string): { messages: number; windowSeconds: number; currentCount: number; timeUntilReset: number } | null {
    const pushProvider = this.getPushProvider(providerName);
    if (pushProvider && typeof pushProvider.getRateLimitInfo === 'function') {
      return pushProvider.getRateLimitInfo();
    }
    return null;
  }
}