import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../telemetryInterface';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { MessageProvider } from '../../messages/messageProvider';
import { PushProviderInterface } from '../../messages/pushProvider';
import { ProviderExecutionStrategyFactory } from '../execution/ProviderExecutionStrategyFactory';
import { ExecutionContext } from '../execution/ProviderExecutionStrategy';
import { AttachmentProviderStrategy } from '../execution/AttachmentProviderStrategy';
import { ScheduledProvider } from './ProviderManager';
import { ProviderConfig } from '../../types/config';
import { SocialMediaClient } from '../socialMediaClient';

/**
 * Handles task execution, push provider management, and rate limiting
 */
export class ExecutionEngine {
  private logger: Logger;
  private telemetry: TelemetryService;
  private socialMediaClient: SocialMediaClient;
  private strategyFactory: ProviderExecutionStrategyFactory;

  constructor(
    logger: Logger,
    telemetry: TelemetryService,
    socialMediaClient: SocialMediaClient,
    getProviderConfigs: () => ProviderConfig[]
  ) {
    this.logger = logger;
    this.telemetry = telemetry;
    this.socialMediaClient = socialMediaClient;
    
    // Initialize strategy factory
    const executionContext: ExecutionContext = {
      logger: this.logger,
      telemetry: this.telemetry,
      socialMediaClient: this.socialMediaClient,
      getProviderConfigs: getProviderConfigs
    };
    this.strategyFactory = new ProviderExecutionStrategyFactory(executionContext);
  }

  /**
   * Executes a task for a specific provider
   */
  public async executeProviderTask(providerName: string, provider: MessageProvider, getProviderConfigs: () => ProviderConfig[]): Promise<void> {
    return await TelemetryHelper.executeWithSpan(
      this.telemetry,
      'provider.execute_task',
      {
        'provider.name': providerName,
        'provider.type': provider.getProviderName(),
      },
      () => this.executeProviderTaskInternal(providerName, provider, getProviderConfigs)
    );
  }

  /**
   * Internal method to execute provider task using strategy pattern
   */
  private async executeProviderTaskInternal(providerName: string, provider: MessageProvider, getProviderConfigs: () => ProviderConfig[]): Promise<void> {
    // Find the provider config
    const providerConfig = getProviderConfigs().find(p => p.name === providerName);
    if (!providerConfig) {
      throw new Error(`Provider configuration not found for: ${providerName}`);
    }

    // Get the appropriate strategy and execute
    const strategy = this.strategyFactory.getStrategy(provider);
    const result = await strategy.execute(providerName, provider, providerConfig);

    if (!result.success && result.error) {
      // Don't throw here to prevent other providers from being affected
      // Error logging and telemetry is handled by the strategy
    }
  }

  /**
   * Executes all provider tasks immediately (for testing)
   */
  public async executeAllTasksNow(scheduledProviders: ScheduledProvider[], getProviderConfigs: () => ProviderConfig[]): Promise<void> {
    this.logger.info('Executing all provider tasks immediately...');
    
    for (const scheduledProvider of scheduledProviders) {
      await this.executeProviderTask(scheduledProvider.name, scheduledProvider.provider, getProviderConfigs);
    }
  }

  /**
   * Executes a specific provider task immediately (for testing)
   */
  public async executeProviderTaskNow(providerName: string, scheduledProviders: ScheduledProvider[], getProviderConfigs: () => ProviderConfig[]): Promise<void> {
    const scheduledProvider = scheduledProviders.find(sp => sp.name === providerName);
    
    if (!scheduledProvider) {
      throw new Error(`Provider "${providerName}" not found`);
    }

    this.logger.info(`Executing task for provider "${providerName}" immediately...`);
    await this.executeProviderTask(scheduledProvider.name, scheduledProvider.provider, getProviderConfigs);
  }

  /**
   * Triggers a push provider with an optional custom message
   */
  public async triggerPushProvider(providerName: string, scheduledProviders: ScheduledProvider[], getProviderConfigs: () => ProviderConfig[], message?: string): Promise<void> {
    const scheduledProvider = scheduledProviders.find(sp => sp.name === providerName);
    
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
    await this.executeProviderTask(scheduledProvider.name, scheduledProvider.provider, getProviderConfigs);
    
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
   * Triggers a push provider with message and attachments
   */
  public async triggerPushProviderWithAttachments(
    providerName: string, 
    scheduledProviders: ScheduledProvider[], 
    getProviderConfigs: () => ProviderConfig[],
    messageData: import('../../messages/messageProvider').MessageWithAttachments
  ): Promise<void> {
    const scheduledProvider = scheduledProviders.find(sp => sp.name === providerName);
    
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
    
    if (messageData.text && typeof pushProvider.setMessage === 'function') {
      pushProvider.setMessage(messageData.text);
      this.logger.debug(`Set custom message for push provider "${providerName}": "${messageData.text}"`);
    }

    this.logger.info(`Triggering push provider "${providerName}" with message and ${messageData.attachments?.length || 0} attachments`);
    
    // Execute the task with attachments
    await this.executeProviderTaskWithAttachments(providerName, scheduledProvider.provider, getProviderConfigs, messageData);
    
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
   * Executes a task for a specific provider with attachments using strategy pattern
   */
  private async executeProviderTaskWithAttachments(
    providerName: string, 
    provider: MessageProvider, 
    getProviderConfigs: () => ProviderConfig[],
    messageData: import('../../messages/messageProvider').MessageWithAttachments
  ): Promise<void> {
    // Find the provider config
    const providerConfig = getProviderConfigs().find(p => p.name === providerName);
    if (!providerConfig) {
      throw new Error(`Provider configuration not found for: ${providerName}`);
    }

    // Use the attachment strategy specifically
    const attachmentStrategy = this.strategyFactory.getStrategyByName('attachment') as AttachmentProviderStrategy;
    if (!attachmentStrategy) {
      throw new Error('Attachment strategy not found');
    }

    const result = await attachmentStrategy.executeWithMessageData(providerName, provider, providerConfig, messageData);

    if (!result.success && result.error) {
      // Don't throw here to prevent other providers from being affected
      // Error logging and telemetry is handled by the strategy
    }
  }

  /**
   * Gets rate limit information for a push provider
   */
  public getPushProviderRateLimit(providerName: string, scheduledProviders: ScheduledProvider[]): { messages: number; windowSeconds: number; currentCount: number; timeUntilReset: number } | null {
    const scheduledProvider = scheduledProviders.find(sp => sp.name === providerName);
    if (scheduledProvider?.provider.getProviderName() === 'push') {
      const pushProvider = scheduledProvider.provider as MessageProvider & PushProviderInterface;
      if (typeof pushProvider.getRateLimitInfo === 'function') {
        return pushProvider.getRateLimitInfo();
      }
    }
    return null;
  }
}