import { Logger } from '../utils/logger';
import { TelemetryService } from './telemetryInterface';
import { MessageProvider } from '../messages/messageProvider';
import { SocialMediaClient } from './socialMediaClient';
import { ProviderConfig } from '../types/config';
import { setInterval, clearInterval } from 'timers';

interface FileWatchTask {
  providerId: string;
  provider: MessageProvider;
  providerConfig: ProviderConfig;
  accounts: string[];
  timestamp: number;
}

/**
 * FileWatcherScheduler handles file change events and dispatches message generation tasks
 * Similar to cron scheduling but triggered by file system events
 */
export class FileWatcherScheduler {
  private logger: Logger;
  private telemetry?: TelemetryService;
  private socialMediaClient: SocialMediaClient;
  private taskQueue: FileWatchTask[] = [];
  private isProcessing = false;
  private processingInterval?: ReturnType<typeof setInterval>;
  private rateLimitMap = new Map<string, number>();
  private startupTime = Date.now();
  private gracePeriod = 3000; // 3 seconds grace period after startup

  constructor(
    logger: Logger,
    socialMediaClient: SocialMediaClient,
    telemetry?: TelemetryService
  ) {
    this.logger = logger;
    this.socialMediaClient = socialMediaClient;
    this.telemetry = telemetry;
    
    // Start task processor
    this.startTaskProcessor();
  }

  /**
   * Register a provider for file watching
   */
  public registerProvider(
    providerId: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig,
    accounts: string[]
  ): void {
    this.logger.info(`Registering file watcher for provider: ${providerId}`);
    
    // Set up file change callback
    if ('setFileChangeCallback' in provider && typeof provider.setFileChangeCallback === 'function') {
      provider.setFileChangeCallback(() => {
        this.onFileChanged(providerId, provider, providerConfig, accounts);
      });
      this.logger.debug(`File change callback registered for provider: ${providerId}`);
    } else {
      this.logger.warn(`Provider ${providerId} does not support file change callbacks`);
    }
  }

  /**
   * Handle file change event
   */
  private onFileChanged(
    providerId: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig,
    accounts: string[]
  ): void {
    const now = Date.now();
    
    // Skip file changes during startup grace period to prevent initial triggers
    if (now - this.startupTime < this.gracePeriod) {
      this.logger.debug(`Ignoring file change during startup grace period for provider ${providerId} (${now - this.startupTime}ms since startup)`);
      return;
    }
    
    // Rate limiting: prevent spam from rapid file changes
    const lastTrigger = this.rateLimitMap.get(providerId) || 0;
    const minInterval = 5000; // 5 seconds minimum between triggers
    
    if (now - lastTrigger < minInterval) {
      this.logger.debug(`Rate limiting file change for provider ${providerId} (${now - lastTrigger}ms since last)`);
      return;
    }
    
    this.rateLimitMap.set(providerId, now);
    
    // Add task to queue
    const task: FileWatchTask = {
      providerId,
      provider,
      providerConfig,
      accounts,
      timestamp: now
    };
    
    this.taskQueue.push(task);
    this.logger.info(`File change detected for provider ${providerId}, task queued (queue size: ${this.taskQueue.length})`);
    
    // Record telemetry
    if (this.telemetry && 'recordCounter' in this.telemetry) {
      (this.telemetry as unknown as { recordCounter: (name: string, value: number, tags: Record<string, string>) => void }).recordCounter('file_watcher.task_queued', 1, {
        provider_id: providerId,
        provider_type: providerConfig.type
      });
    }
  }

  /**
   * Start the task processor
   */
  private startTaskProcessor(): void {
    this.processingInterval = setInterval(() => {
      this.processTaskQueue();
    }, 1000); // Check every second
    
    this.logger.info('File watcher task processor started');
  }

  /**
   * Process queued tasks
   */
  private async processTaskQueue(): Promise<void> {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      const task = this.taskQueue.shift();
      if (!task) {
        return;
      }

      this.logger.info(`Processing file change task for provider: ${task.providerId}`);
      
      const startTime = Date.now();
      
      try {
        // Generate message
        const messageWithAttachments = await task.provider.generateMessageWithAttachments?.() || { text: '', attachments: undefined };
        
        if (!messageWithAttachments.text.trim()) {
          this.logger.warn(`Provider ${task.providerId} generated empty message, skipping`);
          return;
        }

        // Post to all configured accounts
        for (const accountName of task.accounts) {
          try {
            await this.socialMediaClient.postStatusWithAttachments(
              messageWithAttachments,
              [accountName],
              task.providerId
            );
            
            this.logger.info(`File-triggered message posted successfully to ${accountName} from provider ${task.providerId}`);
            
            // Record success telemetry
            if (this.telemetry && 'recordCounter' in this.telemetry) {
              (this.telemetry as unknown as { recordCounter: (name: string, value: number, tags: Record<string, string>) => void }).recordCounter('file_watcher.message_posted', 1, {
                provider_id: task.providerId,
                provider_type: task.providerConfig.type,
                account: accountName
              });
            }
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to post file-triggered message to ${accountName} from provider ${task.providerId}: ${errorMessage}`);
            
            // Record error telemetry
            if (this.telemetry && 'recordCounter' in this.telemetry) {
              (this.telemetry as unknown as { recordCounter: (name: string, value: number, tags: Record<string, string>) => void }).recordCounter('file_watcher.message_failed', 1, {
                provider_id: task.providerId,
                provider_type: task.providerConfig.type,
                account: accountName,
                error: errorMessage
              });
            }
          }
        }
        
        // Record processing time
        const processingTime = Date.now() - startTime;
        if (this.telemetry) {
          this.telemetry.recordHistogram('file_watcher.processing_time', processingTime, {
            provider_id: task.providerId,
            provider_type: task.providerConfig.type
          });
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to generate message for file-triggered provider ${task.providerId}: ${errorMessage}`);
        
        // Record error telemetry
        if (this.telemetry && 'recordCounter' in this.telemetry) {
          (this.telemetry as unknown as { recordCounter: (name: string, value: number, tags: Record<string, string>) => void }).recordCounter('file_watcher.generation_failed', 1, {
            provider_id: task.providerId,
            provider_type: task.providerConfig.type,
            error: errorMessage
          });
        }
      }
      
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue status for monitoring
   */
  public getQueueStatus(): { queueSize: number; isProcessing: boolean; registeredProviders: number } {
    return {
      queueSize: this.taskQueue.length,
      isProcessing: this.isProcessing,
      registeredProviders: this.rateLimitMap.size
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    this.taskQueue = [];
    this.rateLimitMap.clear();
    this.logger.info('File watcher scheduler cleaned up');
  }
}