import { MessageProvider, MessageWithAttachments } from '../../messages/messageProvider';
import { ProviderConfig } from '../../types/config';
import { TelemetryHelper } from '../../utils/telemetryHelper';
import { ProviderExecutionStrategy, ExecutionContext, ExecutionResult } from './ProviderExecutionStrategy';

/**
 * Strategy for executing MultiJsonCommandProvider with per-account cache isolation
 */
export class MultiJsonProviderStrategy extends ProviderExecutionStrategy {
  constructor(context: ExecutionContext) {
    super(context);
  }

  public canHandle(provider: MessageProvider): boolean {
    return provider.getProviderName() === 'multijsoncommand';
  }

  public getStrategyName(): string {
    return 'multijson';
  }

  public async execute(
    providerName: string,
    provider: MessageProvider,
    providerConfig: ProviderConfig
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    return await TelemetryHelper.executeWithSpan(
      this.context.telemetry,
      'provider.execute_multijson_per_account',
      {
        'provider.name': providerName,
        'provider.type': provider.getProviderName(),
        'provider.strategy': this.getStrategyName(),
        'provider.accounts_count': providerConfig.accounts.length,
      },
      async () => {
        try {
          this.context.logger.debug(`Executing MultiJsonCommandProvider "${providerName}" per account for proper cache isolation`);

          const accountMessages: Array<{ 
            account: string; 
            message: string; 
            attachments?: Array<{ 
              data: string; 
              mimeType: string; 
              filename?: string; 
              description?: string 
            }> 
          }> = [];

          // Execute for each account separately to maintain cache isolation
          for (const accountName of providerConfig.accounts) {
            try {
              this.context.logger.debug(`Generating message for account: ${accountName}`);

              // Generate message with attachments for this specific account
              const messageData = await (provider as any).generateMessageWithAttachments(accountName) as MessageWithAttachments;

              if (messageData && messageData.text && messageData.text.trim() !== '') {
                accountMessages.push({
                  account: accountName,
                  message: messageData.text,
                  attachments: messageData.attachments
                });

                this.context.logger.debug(`Generated message for account ${accountName}: "${messageData.text}"`);
              } else {
                this.context.logger.debug(`No message generated for account: ${accountName}`);
              }
            } catch (error) {
              this.context.logger.error(`Failed to generate message for account ${accountName}:`, error);
              // Continue with other accounts
            }
          }

          // Check if any messages were generated
          if (accountMessages.length === 0) {
            this.context.logger.info(`Provider "${providerName}" generated no messages for any account, skipping post`);
            return {
              success: true,
              message: 'No messages generated for any account',
              duration: Date.now() - startTime
            };
          }

          // Post messages for each account
          for (const accountMessage of accountMessages) {
            try {
              const finalVisibility = providerConfig.visibility || 'unlisted';

              let messageData: MessageWithAttachments = {
                text: accountMessage.message,
                attachments: accountMessage.attachments
              };

              // Process message through middleware chain
              let shouldSkip = false;
              let skipReason = '';

              if (this.context.middlewareManager) {
                const middlewareResult = await this.context.middlewareManager.execute(
                  messageData,
                  providerName,
                  providerConfig,
                  [accountMessage.account],
                  finalVisibility
                );

                if (!middlewareResult.success) {
                  throw new Error(`Middleware execution failed: ${middlewareResult.error?.message}`);
                }

                messageData = middlewareResult.message;
                shouldSkip = middlewareResult.skip;
                skipReason = middlewareResult.skipReason || '';
              }

              // Check if middleware requested to skip the message
              if (shouldSkip) {
                this.context.logger.info(`Provider "${providerName}" message skipped by middleware for account ${accountMessage.account}: ${skipReason}`);
                continue; // Skip this account and continue with others
              }

              await this.context.socialMediaClient.postStatusWithAttachments(
                messageData,
                [accountMessage.account],
                providerName,
                finalVisibility
              );

              this.context.logger.info(`Successfully posted message for account ${accountMessage.account} from provider: ${providerName}`);
            } catch (error) {
              this.context.logger.error(`Failed to post message for account ${accountMessage.account}:`, error);
              // Continue with other accounts
            }
          }

          const duration = Date.now() - startTime;
          this.recordExecution(providerName, duration);

          this.context.logger.info(`Successfully completed MultiJsonCommandProvider execution for: ${providerName}`);

          return {
            success: true,
            message: `Posted messages for ${accountMessages.length} accounts`,
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