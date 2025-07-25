import { MessageProvider } from '../../messages/messageProvider';
import { ProviderConfig } from '../../types/config';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { ProviderExecutionStrategy, ExecutionContext, ExecutionResult } from './ProviderExecutionStrategy';

/**
 * Strategy for executing standard providers (non-MultiJson, non-attachment)
 */
export class StandardProviderStrategy extends ProviderExecutionStrategy {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public canHandle(provider: MessageProvider): boolean {
    const providerName = provider.getProviderName();
    return providerName !== 'multijsoncommand' && 
           typeof (provider as any).generateMessageWithAttachments !== 'function';
  }

  public getStrategyName(): string {
    return 'standard';
  }

  public async execute(
    providerName: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    return await TelemetryHelper.executeWithSpan(
      this.context.telemetry,
      'provider.execute_task',
      {
        'provider.name': providerName,
        'provider.type': provider.getProviderName(),
        'provider.strategy': this.getStrategyName(),
      },
      async () => {
        try {
          this.context.logger.debug(`Executing standard provider task: ${providerName}`);

          // Generate message
          const message = await provider.generateMessage();

          // Check if message is empty
          if (this.isEmptyMessage(message)) {
            this.context.logger.info(`Provider "${providerName}" generated empty message, skipping post`);
            return {
              success: true,
              message: 'Empty message, skipped',
              duration: Date.now() - startTime
            };
          }

          // Determine visibility
          const finalVisibility = providerConfig.visibility || 'unlisted';

          // Post message
          await this.context.socialMediaClient.postStatus(
            message,
            providerConfig.accounts,
            providerName,
            finalVisibility
          );

          const duration = Date.now() - startTime;
          this.recordExecution(providerName, duration);

          this.context.logger.info(`Successfully posted message from provider: ${providerName}`);

          return {
            success: true,
            message: 'Message posted successfully',
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