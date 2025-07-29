import * as cron from 'node-cron';
import { SocialMediaClient } from '../socialMediaClient';
import { FileWatcherScheduler } from '../fileWatcherScheduler';
import { JsonCommandProvider } from '../../messages/jsonCommandProvider';
import { MultiJsonCommandProvider } from '../../messages/multiJson/MultiJsonCommandProvider';
import type { TelemetryService } from '../telemetryInterface';
import { BotConfig, ProviderConfig } from '../../types/config';
import { Logger } from '../../utils/logger';
import { MessageProvider } from '../../messages/messageProvider';
import { MessageProviderFactory } from '../../messages/messageProviderFactory';

export interface ScheduledProvider {
  name: string;
  provider: MessageProvider;
  task?: cron.ScheduledTask; // Optional for push providers
  config: ProviderConfig;
}

/**
 * Manages provider lifecycle including initialization, configuration, and scheduling
 */
export class ProviderManager {
  private logger: Logger;
  private telemetry: TelemetryService;
  private socialMediaClient: SocialMediaClient;
  private config: BotConfig;
  private scheduledProviders: ScheduledProvider[] = [];
  private fileWatcherScheduler?: FileWatcherScheduler;

  constructor(
    socialMediaClient: SocialMediaClient,
    config: BotConfig,
    logger: Logger,
    telemetry: TelemetryService
  ) {
    this.socialMediaClient = socialMediaClient;
    this.config = config;
    this.logger = logger;
    this.telemetry = telemetry;
    this.fileWatcherScheduler = new FileWatcherScheduler(logger, socialMediaClient, telemetry);
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

    const failedProviders: string[] = [];
    let successfulProviders = 0;

    for (const providerConfig of providers) {
      if (providerConfig.enabled === false) {
        this.logger.info(`Skipping disabled provider: ${providerConfig.name}`);
        continue;
      }

      try {
        await this.initializeProvider(providerConfig);
        successfulProviders++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to initialize provider "${providerConfig.name}": ${errorMessage}`);
        this.logger.warn(`Provider "${providerConfig.name}" will be skipped due to initialization failure`);
        failedProviders.push(providerConfig.name);
        // Continue with other providers instead of throwing
      }
    }

    // Report results
    if (failedProviders.length > 0) {
      this.logger.warn(`${failedProviders.length} provider(s) failed to initialize: ${failedProviders.join(', ')}`);
    }

    if (successfulProviders === 0) {
      throw new Error(`No providers could be initialized successfully. Failed providers: ${failedProviders.join(', ')}`);
    }

    this.logger.info(`Successfully initialized ${successfulProviders} provider(s)${failedProviders.length > 0 ? ` (${failedProviders.length} failed)` : ''}`);
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
      if (!cron.validate(providerConfig.cronSchedule as string)) {
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
      // Task creation will be handled by the scheduler
      task = undefined; // Will be set by the scheduler
    }

    this.scheduledProviders.push({
      name: providerConfig.name,
      provider: messageProvider,
      task,
      config: providerConfig
    });

    // Register file-based providers with file watcher scheduler
    const isFileBasedProvider = messageProvider instanceof JsonCommandProvider || messageProvider instanceof MultiJsonCommandProvider;
    if (isFileBasedProvider && !providerConfig.cronSchedule) {
      this.fileWatcherScheduler?.registerProvider(
        providerConfig.name,
        messageProvider,
        providerConfig,
        providerConfig.accounts
      );
      this.logger.info(`Registered file watcher for provider "${providerConfig.name}"`);
    }

    if (isPushProvider) {
      this.logger.info(`Initialized push provider "${providerConfig.name}" for accounts: ${providerConfig.accounts.join(', ')}`);
    } else {
      this.logger.info(`Initialized provider "${providerConfig.name}" with schedule: ${providerConfig.cronSchedule} for accounts: ${providerConfig.accounts.join(', ')}`);
    }
  }

  /**
   * Creates cron tasks for scheduled providers
   */
  public createScheduledTasks(taskExecutor: (providerName: string, provider: MessageProvider) => Promise<void>): void {
    for (const scheduledProvider of this.scheduledProviders) {
      if (scheduledProvider.config.cronSchedule && !scheduledProvider.task) {
        scheduledProvider.task = cron.schedule(scheduledProvider.config.cronSchedule, async () => {
          await taskExecutor(scheduledProvider.name, scheduledProvider.provider);
        }, {
          timezone: 'UTC'
        });
      }
    }
  }

  /**
   * Starts all scheduled tasks
   */
  public startScheduledTasks(): { scheduledCount: number; pushCount: number } {
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

    return { scheduledCount, pushCount };
  }

  /**
   * Stops all scheduled tasks
   */
  public stopScheduledTasks(): void {
    for (const scheduledProvider of this.scheduledProviders) {
      if (scheduledProvider.task) {
        scheduledProvider.task.stop();
        this.logger.debug(`Stopped provider: ${scheduledProvider.name}`);
      }
    }

    // Cleanup file watcher scheduler
    if (this.fileWatcherScheduler) {
      this.fileWatcherScheduler.cleanup();
    }
  }

  /**
   * Gets provider configurations from bot config
   */
  public getProviderConfigs(): ProviderConfig[] {
    return this.config.bot.providers || [];
  }

  /**
   * Gets all scheduled providers
   */
  public getScheduledProviders(): ScheduledProvider[] {
    return this.scheduledProviders;
  }

  /**
   * Finds a scheduled provider by name
   */
  public findProvider(providerName: string): ScheduledProvider | undefined {
    return this.scheduledProviders.find(sp => sp.name === providerName);
  }

  /**
   * Returns information about all configured providers (including failed ones)
   */
  public getProviderInfo(): Array<{name: string, type: string, schedule: string, enabled: boolean, status: 'running' | 'failed' | 'disabled'}> {
    const allProviders = this.getProviderConfigs();
    const successfulProviderNames = new Set(this.scheduledProviders.map(sp => sp.name));
    
    return allProviders.map(config => {
      const scheduledProvider = this.scheduledProviders.find(sp => sp.name === config.name);
      
      if (config.enabled === false) {
        return {
          name: config.name,
          type: config.type,
          schedule: config.cronSchedule || 'push (external trigger)',
          enabled: false,
          status: 'disabled' as const
        };
      }
      
      if (scheduledProvider) {
        return {
          name: scheduledProvider.name,
          type: scheduledProvider.provider.getProviderName(),
          schedule: scheduledProvider.config.cronSchedule || 'push (external trigger)',
          enabled: scheduledProvider.config.enabled !== false,
          status: 'running' as const
        };
      }
      
      // Provider was enabled but not in scheduledProviders = failed to initialize
      return {
        name: config.name,
        type: config.type,
        schedule: config.cronSchedule || 'push (external trigger)',
        enabled: config.enabled ?? true,
        status: 'failed' as const
      };
    });
  }

  /**
   * Returns the names of all configured providers
   */
  public getProviderNames(): string[] {
    return this.scheduledProviders.map(sp => sp.name);
  }

  /**
   * Gets all push providers
   */
  public getPushProviders(): Array<{name: string, config: unknown}> {
    return this.scheduledProviders
      .filter(sp => sp.provider.getProviderName() === 'push')
      .map(sp => ({
        name: sp.name,
        config: (sp.provider as any).getConfig ? (sp.provider as any).getConfig() : {}
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
  public getPushProvider(providerName: string): any | null {
    const scheduledProvider = this.scheduledProviders.find(sp => sp.name === providerName);
    if (scheduledProvider?.provider.getProviderName() === 'push') {
      return scheduledProvider.provider;
    }
    return null;
  }
}