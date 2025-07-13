import { ConfigLoader } from './config/configLoader';
import { SocialMediaClient } from './services/socialMediaClient';
import { MultiProviderScheduler } from './services/multiProviderScheduler';
import { WebhookServer } from './services/webhookServer';
import { SecretRotationDetector } from './services/secretRotationDetector';
import { createTelemetryService } from './services/telemetryFactory';
import { Logger } from './utils/logger';
import { BotConfig, CliOptions } from './types/config';

export class MastodonPingBot {
  private config!: BotConfig; // Will be set in initialize()
  private logger!: Logger; // Will be set in initialize()
  private telemetry: any; // Will be set in initialize()
  private socialMediaClient!: SocialMediaClient; // Initialized in initialize()
  private scheduler!: MultiProviderScheduler; // Initialized in initialize()
  private webhookServer?: WebhookServer; // Optional webhook server
  private secretRotationDetector?: SecretRotationDetector; // Optional secret rotation detector
  private cliOptions: CliOptions;

  constructor(cliOptions: CliOptions) {
    this.cliOptions = cliOptions;
    // Config and logger will be initialized in initialize() method after secret resolution
  }

  /**
   * Initializes the bot and verifies the connection
   */
  public async initialize(): Promise<void> {
    // Load configuration with secret resolution
    this.config = await ConfigLoader.loadConfigWithSecrets(this.cliOptions);
    this.logger = new Logger(this.config.logging.level);
    
    this.logger.info('Initializing Buntspecht...');
    
    // Initialize telemetry first
    this.telemetry = await createTelemetryService(this.config.telemetry!, this.logger);
    await this.telemetry.initialize();
    
    // Initialize other services with telemetry
    this.socialMediaClient = new SocialMediaClient(this.config, this.logger, this.telemetry);
    this.scheduler = new MultiProviderScheduler(this.socialMediaClient, this.config, this.logger, this.telemetry);
    
    // Initialize webhook server if configured
    if (this.config.webhook?.enabled) {
      this.webhookServer = new WebhookServer(this.config.webhook, this, this.logger, this.telemetry);
      // Start webhook server immediately - it should work independently of social media verification
      await this.webhookServer.start();
    }

    // Initialize secret rotation detector if configured
    if (this.config.secretRotation?.enabled !== false) { // Default to enabled
      this.secretRotationDetector = new SecretRotationDetector(
        this.config,
        this.socialMediaClient,
        this.logger,
        this.telemetry,
        this.config.secretRotation
      );
      await this.secretRotationDetector.initialize();
    }
    
    const isConnected = await this.socialMediaClient.verifyConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to social media accounts. Please check your configuration.');
    }

    // Initialize the scheduler with message provider
    await this.scheduler.initialize();

    this.logger.info('Bot initialized successfully');
  }

  /**
   * Starts the bot scheduler and secret rotation detector
   * Note: Webhook server is started during initialize() to work independently of social media verification
   */
  public async start(): Promise<void> {
    this.logger.info('Starting Buntspecht...');
    await this.scheduler.start();
    
    // Webhook server is already started in initialize() method
    // This ensures it works even if social media verification fails

    // Start secret rotation detector if configured
    if (this.secretRotationDetector) {
      this.secretRotationDetector.start();
    }
  }

  /**
   * Stops the bot scheduler and webhook server
   */
  public async stop(): Promise<void> {
    this.logger.info('Stopping Buntspecht...');
    this.scheduler.stop();
    
    // Stop webhook server if running
    if (this.webhookServer) {
      await this.webhookServer.stop();
    }

    // Stop secret rotation detector if running
    if (this.secretRotationDetector) {
      this.secretRotationDetector.stop();
    }
    
    await this.telemetry.shutdown();
  }

  /**
   * Posts a test message immediately
   */
  public async testPost(): Promise<void> {
    this.logger.info('Posting test message...');
    await this.scheduler.executeAllTasksNow();
  }

  /**
   * Verifies the connection and displays account info
   */
  public async verify(): Promise<void> {
    this.logger.info('Verifying connections...');
    
    const isConnected = await this.socialMediaClient.verifyConnection();
    if (!isConnected) {
      throw new Error('Connection verification failed for one or more accounts');
    }

    const accountsInfo = await this.socialMediaClient.getAllAccountsInfo();
    this.logger.info(`Successfully verified ${accountsInfo.length} account(s):`);
    
    for (const { accountName, account, instance, platform } of accountsInfo) {
      if (platform === 'mastodon') {
        const mastodonAccount = account as any;
        this.logger.info(`  ${accountName} (Mastodon): @${mastodonAccount.username}@${new URL(instance).hostname}`);
        this.logger.info(`    Display Name: ${mastodonAccount.displayName}`);
        this.logger.info(`    Followers: ${mastodonAccount.followersCount}, Following: ${mastodonAccount.followingCount}`);
      } else if (platform === 'bluesky') {
        const blueskyAccount = account as any;
        this.logger.info(`  ${accountName} (Bluesky): @${blueskyAccount.handle}`);
        this.logger.info(`    Display Name: ${blueskyAccount.displayName}`);
        this.logger.info(`    Followers: ${blueskyAccount.followersCount}, Following: ${blueskyAccount.followingCount}`);
      }
    }
    
    this.logger.info('All connections verified successfully');
  }

  /**
   * Graceful shutdown handler
   */
  public setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): BotConfig {
    return this.config;
  }

  /**
   * Gets the logger instance
   */
  public getLogger(): Logger {
    return this.logger;
  }

  /**
   * Gets information about configured providers
   */
  public getProviderInfo(): Array<{name: string, type: string, schedule: string, enabled: boolean}> {
    return this.scheduler.getProviderInfo();
  }

  /**
   * Posts a test message from a specific provider
   */
  public async testPostFromProvider(providerName: string): Promise<void> {
    this.logger.info(`Posting test message from provider: ${providerName}`);
    await this.scheduler.executeProviderTaskNow(providerName);
  }

  /**
   * Returns whether the bot is using multi-provider mode (always true now)
   */
  public isMultiProviderMode(): boolean {
    return true;
  }

  /**
   * Triggers a push provider with an optional custom message
   */
  public async triggerPushProvider(providerName: string, message?: string): Promise<void> {
    this.logger.info(`Triggering push provider: ${providerName}${message ? ' with custom message' : ''}`);
    await this.scheduler.triggerPushProvider(providerName, message);
  }

  /**
   * Triggers a push provider with optional message and visibility
   */
  public async triggerPushProviderWithVisibility(providerName: string, message?: string, visibility?: 'public' | 'unlisted' | 'private' | 'direct'): Promise<void> {
    this.logger.info(`Triggering push provider: ${providerName}${message ? ' with custom message' : ''}${visibility ? ` with visibility: ${visibility}` : ''}`);
    
    // Get the push provider and set visibility if provided
    if (visibility) {
      const pushProvider = this.scheduler.getPushProvider(providerName);
      if (pushProvider && typeof pushProvider.setMessage === 'function') {
        pushProvider.setMessage(message || '', visibility);
        // Don't pass message to triggerPushProvider since we already set it with visibility
        await this.scheduler.triggerPushProvider(providerName);
        return;
      }
    }
    
    // Fallback to regular trigger if no visibility or provider doesn't support it
    await this.scheduler.triggerPushProvider(providerName, message);
  }

  /**
   * Triggers a push provider with optional message, visibility, and attachments
   */
  public async triggerPushProviderWithVisibilityAndAttachments(
    providerName: string, 
    message?: string, 
    visibility?: 'public' | 'unlisted' | 'private' | 'direct',
    attachments?: import('./messages/messageProvider').Attachment[]
  ): Promise<void> {
    this.logger.info(`Triggering push provider: ${providerName}${message ? ' with custom message' : ''}${visibility ? ` with visibility: ${visibility}` : ''}${attachments ? ` with ${attachments.length} attachments` : ''}`);
    
    // Get the push provider and set message with visibility if provided
    if (visibility || attachments) {
      const pushProvider = this.scheduler.getPushProvider(providerName);
      if (pushProvider && typeof pushProvider.setMessage === 'function') {
        pushProvider.setMessage(message || '', visibility);
        
        // If attachments are provided, we need to trigger with attachments
        if (attachments && attachments.length > 0) {
          await this.scheduler.triggerPushProviderWithAttachments(providerName, { text: message || '', attachments });
          return;
        }
        
        // No attachments, use regular trigger
        await this.scheduler.triggerPushProvider(providerName);
        return;
      }
    }
    
    // Fallback to regular trigger if no special handling needed
    if (attachments && attachments.length > 0) {
      await this.scheduler.triggerPushProviderWithAttachments(providerName, { text: message || '', attachments });
    } else {
      await this.scheduler.triggerPushProvider(providerName, message);
    }
  }

  /**
   * Gets all configured push providers
   */
  public getPushProviders(): Array<{name: string, config: any}> {
    return this.scheduler.getPushProviders();
  }

  /**
   * Checks if a provider is a push provider
   */
  public isPushProvider(providerName: string): boolean {
    return this.scheduler.isPushProvider(providerName);
  }

  /**
   * Gets webhook server status and configuration
   */
  public getWebhookInfo(): { enabled: boolean; running: boolean; config?: any } {
    return {
      enabled: !!this.config.webhook?.enabled,
      running: this.webhookServer?.isServerRunning() || false,
      config: this.webhookServer?.getConfig()
    };
  }

  /**
   * Checks if webhook server is enabled
   */
  public isWebhookEnabled(): boolean {
    return !!this.config.webhook?.enabled;
  }

  /**
   * Checks if webhook server is running
   */
  public isWebhookRunning(): boolean {
    return this.webhookServer?.isServerRunning() || false;
  }

  /**
   * Gets a push provider instance by name
   */
  public getPushProvider(providerName: string): any | null {
    return this.scheduler.getPushProvider(providerName);
  }

  /**
   * Gets rate limit information for a push provider
   */
  public getPushProviderRateLimit(providerName: string): { messages: number; windowSeconds: number; currentCount: number; timeUntilReset: number } | null {
    return this.scheduler.getPushProviderRateLimit(providerName);
  }

  /**
   * Gets secret rotation detector status
   */
  public getSecretRotationStatus(): {
    enabled: boolean;
    running: boolean;
    secretsMonitored: number;
    lastCheck?: Date;
    totalRotationsDetected: number;
    checkInterval: string;
  } | null {
    return this.secretRotationDetector?.getStatus() || null;
  }

  /**
   * Gets detailed information about monitored secrets
   */
  public getMonitoredSecrets(): Array<{
    accountName: string;
    fieldName: string;
    source: string;
    lastChecked: Date;
    checkCount: number;
    lastRotationDetected?: Date;
  }> {
    return this.secretRotationDetector?.getMonitoredSecrets() || [];
  }

  /**
   * Manually trigger a check for secret rotations
   */
  public async checkSecretRotations(): Promise<void> {
    if (!this.secretRotationDetector) {
      throw new Error('Secret rotation detector is not enabled');
    }
    await this.secretRotationDetector.checkForSecretRotations();
  }

  /**
   * Check if secret rotation detection is enabled
   */
  public isSecretRotationEnabled(): boolean {
    return !!this.secretRotationDetector;
  }
}