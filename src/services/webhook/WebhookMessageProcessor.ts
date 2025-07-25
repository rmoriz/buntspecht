import { Logger } from '../../utils/logger';
import { MastodonPingBot } from '../../bot';
import { MessageWithAttachments } from '../../messages/messageProvider';
import { JsonTemplateProcessor, AttachmentConfig } from '../../utils/jsonTemplateProcessor';
import { WebhookRequest, ValidationError } from './WebhookValidator';

export interface WebhookResponse {
  success: boolean;
  message: string;
  timestamp: string;
  provider?: string;
  accounts?: string[];
}

/**
 * Handles webhook message processing including JSON workflow, template processing, and message generation
 */
export class WebhookMessageProcessor {
  private bot: MastodonPingBot;
  private logger: Logger;
  private templateProcessor: JsonTemplateProcessor;

  constructor(bot: MastodonPingBot, logger: Logger) {
    this.bot = bot;
    this.logger = logger;
    this.templateProcessor = new JsonTemplateProcessor(logger);
  }

  /**
   * Processes the webhook request and generates the appropriate response
   */
  public async processWebhookRequest(request: WebhookRequest): Promise<WebhookResponse> {
    this.logger.info(`Processing webhook for provider: ${request.provider}`);

    // Check if provider exists and is a push provider
    if (!this.bot.isPushProvider(request.provider)) {
      throw new ValidationError(`Provider "${request.provider}" is not a push provider or does not exist`);
    }

    let processedMessages: MessageWithAttachments[] = [];

    // Process JSON workflow if provided, or if we have JSON data and a template in config
    if (request.json) {
      // Try to resolve template from config if not provided
      const template = this.resolveTemplate(request);
      if (template) {
        processedMessages = await this.processJsonWorkflow(request);
      } else if (request.message) {
        // Fallback to simple message if no template found
        processedMessages = [{ text: request.message, attachments: undefined }];
      } else {
        // More helpful error message with configuration guidance
        const providerInfo = this.bot.getProviderInfo().find(p => p.name === request.provider);
        if (providerInfo) {
          throw new ValidationError(`No template configured for provider "${request.provider}". Please add a 'template' field to the provider configuration, or provide a 'template' or 'message' in the webhook request.`);
        } else {
          throw new ValidationError(`Provider "${request.provider}" not found. Please check the provider name or configure the provider in your config.toml file.`);
        }
      }
    } else if (request.message) {
      // Traditional message workflow
      processedMessages = [{ text: request.message, attachments: undefined }];
    } else {
      throw new ValidationError('Either JSON data with template or a message is required');
    }

    // Process each message (for multi-JSON support)
    let successCount = 0;
    const errors: string[] = [];

    for (const messageData of processedMessages) {
      try {
        // Trigger the push provider with the processed message
        if (typeof this.bot.triggerPushProviderWithVisibilityAndAttachments === 'function') {
          await this.bot.triggerPushProviderWithVisibilityAndAttachments(
            request.provider, 
            messageData.text, 
            request.visibility,
            messageData.attachments
          );
        } else if (typeof this.bot.triggerPushProviderWithVisibility === 'function') {
          await this.bot.triggerPushProviderWithVisibility(request.provider, messageData.text, request.visibility);
        } else {
          // Fallback for backward compatibility (tests)
          await this.bot.triggerPushProvider(request.provider, messageData.text);
        }
        successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);
        this.logger.error(`Failed to process message for provider ${request.provider}: ${errorMessage}`);
      }
    }

    if (successCount === 0 && errors.length > 0) {
      throw new Error(`All messages failed: ${errors.join(', ')}`);
    }

    const response: WebhookResponse = {
      success: true,
      message: processedMessages.length > 1 
        ? `Successfully processed ${successCount}/${processedMessages.length} messages for provider "${request.provider}"`
        : `Successfully triggered push provider "${request.provider}"`,
      timestamp: new Date().toISOString(),
      provider: request.provider
    };

    // Add accounts info if available
    const pushProviders = this.bot.getPushProviders();
    const providerInfo = pushProviders.find(p => p.name === request.provider);
    if (providerInfo) {
      // Get accounts from provider config (this would need to be exposed by the bot)
      const providerDetails = this.bot.getProviderInfo().find(p => p.name === request.provider);
      if (providerDetails) {
        // Note: We'd need to expose account info from the bot for this to work
        response.accounts = request.accounts || [];
      }
    }

    if (errors.length > 0) {
      (response as { warnings?: string[] }).warnings = errors;
    }

    this.logger.info(`Webhook processed successfully for provider: ${request.provider} (${successCount}/${processedMessages.length} messages)`);
    return response;
  }

  /**
   * Processes JSON workflow (single object or array)
   */
  private async processJsonWorkflow(request: WebhookRequest): Promise<MessageWithAttachments[]> {
    if (!request.json) {
      throw new ValidationError('JSON data is required for JSON workflow');
    }

    // Resolve template from various sources
    const template = this.resolveTemplate(request);
    if (!template) {
      throw new ValidationError('Template is required for JSON workflow. Provide template, templateName, or configure a default template for the provider.');
    }

    const messages: MessageWithAttachments[] = [];

    // Handle array (multi-JSON workflow)
    if (Array.isArray(request.json)) {
      const uniqueKey = request.uniqueKey || 'id';
      
      for (let i = 0; i < request.json.length; i++) {
        const item = request.json[i];
        
        if (typeof item !== 'object' || item === null) {
          this.logger.warn(`JSON array item at index ${i} is not an object, skipping`);
          continue;
        }
        
        const jsonObj = item as Record<string, unknown>;
        const uniqueId = String(jsonObj[uniqueKey] || i);
        
        try {
          const message = this.templateProcessor.applyTemplate(template, jsonObj);
          const attachmentConfig: AttachmentConfig = {
            attachmentsKey: request.attachmentsKey,
            attachmentDataKey: request.attachmentDataKey,
            attachmentMimeTypeKey: request.attachmentMimeTypeKey,
            attachmentFilenameKey: request.attachmentFilenameKey,
            attachmentDescriptionKey: request.attachmentDescriptionKey
          };
          const attachments = this.templateProcessor.extractAttachments(jsonObj, attachmentConfig);
          
          messages.push({
            text: message,
            attachments: attachments.length > 0 ? attachments : undefined
          });
          
          this.logger.debug(`Processed JSON array item ${uniqueKey}="${uniqueId}": "${message}"`);
          if (attachments.length > 0) {
            this.logger.debug(`Found ${attachments.length} attachments for ${uniqueKey}="${uniqueId}"`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process JSON array item ${uniqueKey}="${uniqueId}": ${errorMessage}`);
          // Continue processing other items
        }
      }
    } else if (typeof request.json === 'object' && request.json !== null) {
      // Handle single object (JSON workflow)
      const jsonObj = request.json as Record<string, unknown>;
      
      try {
        const message = this.templateProcessor.applyTemplate(template, jsonObj);
        const attachmentConfig: AttachmentConfig = {
          attachmentsKey: request.attachmentsKey,
          attachmentDataKey: request.attachmentDataKey,
          attachmentMimeTypeKey: request.attachmentMimeTypeKey,
          attachmentFilenameKey: request.attachmentFilenameKey,
          attachmentDescriptionKey: request.attachmentDescriptionKey
        };
        const attachments = this.templateProcessor.extractAttachments(jsonObj, attachmentConfig);
        
        messages.push({
          text: message,
          attachments: attachments.length > 0 ? attachments : undefined
        });
        
        this.logger.debug(`Processed JSON object: "${message}"`);
        if (attachments.length > 0) {
          this.logger.debug(`Found ${attachments.length} attachments`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process JSON object: ${errorMessage}`);
        throw error;
      }
    } else {
      throw new ValidationError('JSON data must be an object or array');
    }

    if (messages.length === 0) {
      this.logger.warn('No valid messages generated from JSON data');
    }

    return messages;
  }

  /**
   * Resolves template from various sources in priority order:
   * 1. Explicit template in request (highest priority)
   * 2. Named template from provider config
   * 3. Default template from provider config
   */
  private resolveTemplate(request: WebhookRequest): string | null {
    // 1. Explicit template in request (overrides everything)
    if (request.template) {
      this.logger.debug(`Using explicit template from request for provider: ${request.provider}`);
      return request.template;
    }

    // Get provider configuration
    const providerInfo = this.bot.getProviderInfo().find(p => p.name === request.provider);
    if (!providerInfo) {
      this.logger.warn(`Provider "${request.provider}" not found in configuration`);
      return null;
    }

    // Get provider config from bot (we need access to the full config)
    let botConfig;
    try {
      botConfig = this.bot.getConfig();
    } catch (error) {
      this.logger.warn(`Failed to get bot config for template resolution: ${(error as Error).message}`);
      return null;
    }

    const providerConfig = botConfig.bot.providers.find(p => p.name === request.provider);
    if (!providerConfig) {
      this.logger.warn(`Provider configuration not found for: ${request.provider}`);
      return null;
    }

    // 2. Named template from provider config
    if (request.templateName && providerConfig.templates) {
      const namedTemplate = providerConfig.templates[request.templateName];
      if (namedTemplate) {
        this.logger.debug(`Using named template "${request.templateName}" from provider config for: ${request.provider}`);
        return namedTemplate;
      } else {
        this.logger.warn(`Named template "${request.templateName}" not found in provider "${request.provider}" config`);
      }
    }

    // 3. Default template from provider config (both top-level and in config section)
    if (providerConfig.template) {
      this.logger.debug(`Using default template from provider config for: ${request.provider}`);
      return providerConfig.template;
    }
    
    // 4. Template from provider config.template (for push providers)
    if (providerConfig.config && typeof providerConfig.config === 'object') {
      const configObj = providerConfig.config as Record<string, unknown>;
      if (configObj.template && typeof configObj.template === 'string') {
        this.logger.debug(`Using template from provider config.template for: ${request.provider}`);
        return configObj.template;
      }
    }

    // No template found
    this.logger.debug(`No template found for provider: ${request.provider}`);
    return null;
  }
}