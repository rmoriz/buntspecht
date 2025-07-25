import { MessageProvider, MessageWithAttachments } from '../../messages/messageProvider';
import { ProviderConfig } from '../../types/config';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { ProviderExecutionStrategy, ExecutionContext, ExecutionResult } from './ProviderExecutionStrategy';

/**
 * Strategy for executing providers that support attachments (like JsonCommandProvider)
 */
export class AttachmentProviderStrategy extends ProviderExecutionStrategy {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public canHandle(provider: MessageProvider): boolean {
    return provider.getProviderName() === 'jsoncommand' && 
           typeof (provider as any).generateMessageWithAttachments === 'function';
  }

  public getStrategyName(): string {
    return 'attachment';
  }

  public async execute(
    providerName: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    return await TelemetryHelper.executeWithSpan(
      this.context.telemetry,
      'provider.execute_task_with_attachments',
      {
        'provider.name': providerName,
        'provider.type': provider.getProviderName(),
        'provider.strategy': this.getStrategyName(),
        'provider.accounts_count': providerConfig.accounts.length,
      },
      async () => {
        try {
          this.context.logger.debug(`Executing attachment provider task: ${providerName}`);

          // Generate message with attachments
          const messageData = await (provider as any).generateMessageWithAttachments() as MessageWithAttachments;

          // Check if message is empty
          if (this.isEmptyMessage(messageData.text)) {
            this.context.logger.info(`Provider "${providerName}" has empty message, skipping post`);
            return {
              success: true,
              message: 'Empty message, skipped',
              duration: Date.now() - startTime
            };
          }

          // Determine visibility
          const finalVisibility = providerConfig.visibility || 'unlisted';

          // Post message with attachments
          await this.context.socialMediaClient.postStatusWithAttachments(
            messageData,
            providerConfig.accounts,
            providerName,
            finalVisibility
          );

          const duration = Date.now() - startTime;
          this.recordExecution(providerName, duration);

          this.context.logger.info(`Successfully posted message with attachments from provider: ${providerName}`);

          return {
            success: true,
            message: 'Message with attachments posted successfully',
            duration
          };

        } catch (error) {
          const duration = Date.now() - startTime;
          this.recordError(providerName, error as Error);

          return {
            success: false,
            error: (error as Error).message,
            duration
          };
        }
      }
    );
  }

  /**
   * Execute with pre-generated message data (for push providers)
   */
  public async executeWithMessageData(
    providerName: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig,
    messageData: MessageWithAttachments
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    return await TelemetryHelper.executeWithSpan(
      this.context.telemetry,
      'provider.execute_task_with_attachments',
      {
        'provider.name': providerName,
        'provider.type': provider.getProviderName(),
        'provider.strategy': this.getStrategyName(),
        'provider.accounts_count': providerConfig.accounts.length,
        'provider.attachments_count': messageData.attachments?.length || 0,
      },
      async () => {
        try {
          this.context.logger.debug(`Executing attachment provider task with pre-generated data: ${providerName}`);

          // Check if message is empty
          if (this.isEmptyMessage(messageData.text)) {
            this.context.logger.info(`Provider "${providerName}" has empty message, skipping post`);
            return {
              success: true,
              message: 'Empty message, skipped',
              duration: Date.now() - startTime
            };
          }

          // Determine visibility
          const finalVisibility = providerConfig.visibility || 'unlisted';

          // Post message with attachments
          await this.context.socialMediaClient.postStatusWithAttachments(
            messageData,
            providerConfig.accounts,
            providerName,
            finalVisibility
          );

          const duration = Date.now() - startTime;
          this.recordExecution(providerName, duration);

          this.context.logger.info(`Successfully posted message with attachments from provider: ${providerName}`);

          return {
            success: true,
            message: 'Message with attachments posted successfully',
            duration
          };

        } catch (error) {
          const duration = Date.now() - startTime;
          this.recordError(providerName, error as Error);

          return {
            success: false,
            error: (error as Error).message,
            duration
          };
        }
      }
    );
  }
}