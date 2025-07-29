import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';
import { createHash } from 'crypto';

export interface OpenRouterConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** AI model to use (e.g., "anthropic/claude-3-sonnet", "openai/gpt-4") */
  model: string;
  /** System prompt that defines the AI's role and behavior (legacy field) */
  prompt?: string;
  /** System prompt that defines the AI's role and behavior */
  systemPrompt?: string;
  /** User prompt template with {{message}} placeholder for the content */
  userPrompt?: string;
  /** How to use the AI response: 'replace', 'prepend', 'append', 'enhance' */
  mode?: 'replace' | 'prepend' | 'append' | 'enhance';
  /** Maximum tokens for the response */
  maxTokens?: number;
  /** Temperature for response creativity (0.0 - 1.0) */
  temperature?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to include context information in the prompt */
  includeContext?: boolean;
  /** Custom context template */
  contextTemplate?: string;
  /** Fallback behavior if API fails */
  fallbackOnError?: 'skip' | 'continue' | 'use_original';
  /** Custom skip reason for API failures */
  skipReason?: string;
  /** Whether to cache responses to avoid duplicate API calls */
  enableCaching?: boolean;
  /** Cache duration in milliseconds */
  cacheDuration?: number;
}

interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface CacheEntry {
  response: string;
  timestamp: number;
  tokens: number;
}

/**
 * Middleware for AI-powered message processing using OpenRouter
 */
export class OpenRouterMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: OpenRouterConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(name: string, config: OpenRouterConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      maxTokens: 10000,
      temperature: 0.7,
      timeout: 90000,
      includeContext: true,
      fallbackOnError: 'continue',
      enableCaching: true,
      cacheDuration: 3600000, // 1 hour
      mode: 'replace',
      ...config
    };

    // Validate required config
    if (!this.config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
    if (!this.config.model) {
      throw new Error('OpenRouter model is required');
    }
    
    // Support both legacy 'prompt' and new 'systemPrompt' fields
    const hasLegacyPrompt = this.config.prompt;
    const hasSystemPrompt = this.config.systemPrompt;
    
    if (!hasLegacyPrompt && !hasSystemPrompt) {
      throw new Error('OpenRouter prompt or systemPrompt is required');
    }
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.debug(`Initialized OpenRouterMiddleware: ${this.name} with model: ${this.config.model}`);

    // Start cache cleanup if caching is enabled
    if (this.config.enableCaching) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupCache();
      }, this.config.cacheDuration! / 4); // Cleanup every quarter of cache duration
    }
  }

  public async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    const originalText = context.message.text;
    
    try {
      const startTime = Date.now();

      // Store original text early for error recovery
      context.data[`${this.name}_original_text`] = originalText;

      // Build the user message with context if enabled
      const userMessage = this.buildUserMessage(originalText, context);
      
      // Check cache first
      let aiResponse: string;
      const cacheKey = this.getCacheKey(userMessage);
      
      if (this.config.enableCaching && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        if (Date.now() - cached.timestamp < this.config.cacheDuration!) {
          aiResponse = cached.response;
          this.logger?.debug(`OpenRouterMiddleware ${this.name}: Using cached response`);
          context.data[`${this.name}_cached`] = true;
          context.data[`${this.name}_tokens_used`] = cached.tokens;
        } else {
          this.cache.delete(cacheKey);
          aiResponse = await this.callOpenRouter(userMessage);
        }
      } else {
        aiResponse = await this.callOpenRouter(userMessage);
      }

      // Apply the AI response based on mode
      const processedText = this.applyAIResponse(originalText, aiResponse);
      
      // Update message
      context.message.text = processedText;

      const executionTime = Date.now() - startTime;
      this.logger?.debug(`OpenRouterMiddleware ${this.name} completed in ${executionTime}ms`);
      
      context.data[`${this.name}_ai_response`] = aiResponse;
      context.data[`${this.name}_processed`] = true;
      context.data[`${this.name}_execution_time`] = executionTime;
      context.data[`${this.name}_model`] = this.config.model;

      // Record telemetry
      this.telemetry?.recordProviderExecution?.(this.name, executionTime);

      // Continue to next middleware
      await next();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`OpenRouterMiddleware ${this.name} failed:`, error);
      
      context.data[`${this.name}_error`] = errorMessage;
      this.telemetry?.recordError?.('openrouter_middleware_failed', 'middleware');

      // Handle fallback behavior
      await this.handleError(context, errorMessage, next);
    }
  }

  private buildUserMessage(originalText: string, context: MessageMiddlewareContext): string {
    // If userPrompt is provided, use it as a template
    if (this.config.userPrompt) {
      let userMessage = this.config.userPrompt;
      
      // Replace {{message}} placeholder with the original text
      userMessage = userMessage.replace(/\{\{message\}\}/g, originalText);
      
      // If context is enabled, also replace context variables
      if (this.config.includeContext) {
        const contextData = {
          providerName: context.providerName,
          accountNames: context.accountNames.join(', '),
          visibility: context.visibility,
          timestamp: new Date().toISOString(),
          messageLength: originalText.length
        };

        for (const [key, value] of Object.entries(contextData)) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedValue = String(value).replace(/\$/g, '$$$$');
          userMessage = userMessage.replace(new RegExp(`{{${escapedKey}}}`, 'g'), escapedValue);
        }
      }
      
      return userMessage;
    }

    // Legacy behavior: build user message with context
    let userMessage = originalText;

    if (this.config.includeContext) {
      const contextInfo = this.config.contextTemplate || this.getDefaultContextTemplate();
      
      // Replace context variables safely
      const contextData = {
        providerName: context.providerName,
        accountNames: context.accountNames.join(', '),
        visibility: context.visibility,
        timestamp: new Date().toISOString(),
        messageLength: originalText.length
      };

      let processedContext = contextInfo;
      for (const [key, value] of Object.entries(contextData)) {
        // Escape special regex characters in the key and value
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedValue = String(value).replace(/\$/g, '$$$$');
        processedContext = processedContext.replace(new RegExp(`{{${escapedKey}}}`, 'g'), escapedValue);
      }

      userMessage = `${processedContext}\n\nMessage to process:\n${originalText}`;
    }

    return userMessage;
  }

  private getDefaultContextTemplate(): string {
    return `Context:
- Provider: {{providerName}}
- Target accounts: {{accountNames}}
- Visibility: {{visibility}}
- Timestamp: {{timestamp}}
- Message length: {{messageLength}} characters`;
  }

  private async callOpenRouter(userMessage: string): Promise<string> {
    // Use systemPrompt if available, otherwise fall back to legacy prompt
    const systemPrompt = this.config.systemPrompt || this.config.prompt!;
    
    const requestBody: OpenRouterRequest = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false
    };

    // Debug: Log the request details
    this.logger?.debug(`OpenRouterMiddleware ${this.name} - API Request:`, {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      model: requestBody.model,
      maxTokens: requestBody.max_tokens,
      temperature: requestBody.temperature,
      systemPromptLength: systemPrompt.length,
      userMessageLength: userMessage.length,
      systemPrompt: systemPrompt.substring(0, 200) + (systemPrompt.length > 200 ? '...' : ''),
      userMessage: userMessage.substring(0, 500) + (userMessage.length > 500 ? '...' : ''),
      hasApiKey: !!this.config.apiKey,
      apiKeyPrefix: this.config.apiKey ? this.config.apiKey.substring(0, 10) + '...' : 'MISSING'
    });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/rmoriz/buntspecht',
        'X-Title': 'Buntspecht Social Media Bot'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    // Debug: Log the response status
    this.logger?.debug(`OpenRouterMiddleware ${this.name} - API Response Status:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: response.headers && typeof response.headers.entries === 'function' 
        ? Object.fromEntries(response.headers.entries()) 
        : 'Headers not available in test environment'
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger?.error(`OpenRouterMiddleware ${this.name} - API Error Response:`, {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText
      });
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as OpenRouterResponse;
    
    // Debug: Log the successful response
    this.logger?.debug(`OpenRouterMiddleware ${this.name} - API Success Response:`, {
      model: data.model,
      usage: data.usage,
      choicesCount: data.choices?.length || 0,
      responseLength: data.choices?.[0]?.message?.content?.length || 0,
      response: data.choices?.[0]?.message?.content?.substring(0, 500) + (data.choices?.[0]?.message?.content?.length > 500 ? '...' : ''),
      finishReason: data.choices?.[0]?.finish_reason
    });
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response choices returned from OpenRouter API');
    }

    const aiResponse = data.choices[0].message.content;
    
    // Cache the response if caching is enabled
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(userMessage);
      this.cache.set(cacheKey, {
        response: aiResponse,
        timestamp: Date.now(),
        tokens: data.usage.total_tokens
      });
    }

    // Log token usage
    this.logger?.debug(`OpenRouterMiddleware ${this.name}: Used ${data.usage.total_tokens} tokens (${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion)`);
    
    return aiResponse;
  }

  private applyAIResponse(originalText: string, aiResponse: string): string {
    switch (this.config.mode) {
      case 'replace':
        return aiResponse;
      
      case 'prepend':
        return `${aiResponse}\n\n${originalText}`;
      
      case 'append':
        return `${originalText}\n\n${aiResponse}`;
      
      case 'enhance':
        // For enhance mode, we assume the AI response is the enhanced version
        return aiResponse;
      
      default:
        this.logger?.warn(`Unknown mode: ${this.config.mode}, using replace`);
        return aiResponse;
    }
  }

  private async handleError(context: MessageMiddlewareContext, errorMessage: string, next: () => Promise<void>): Promise<void> {
    switch (this.config.fallbackOnError) {
      case 'skip':
        context.skip = true;
        context.skipReason = this.config.skipReason || `OpenRouter API failed: ${errorMessage}`;
        this.logger?.info(`OpenRouterMiddleware ${this.name} skipped message due to error: ${context.skipReason}`);
        return; // Don't call next()
      
      case 'continue':
        // Restore original message text since AI processing failed
        const originalText = context.data[`${this.name}_original_text`] as string;
        if (originalText) {
          context.message.text = originalText;
        }
        this.logger?.info(`OpenRouterMiddleware ${this.name} continuing with original message due to error`);
        await next();
        return;
      
      case 'use_original':
        // Restore original message text since AI processing failed
        const originalTextForUseOriginal = context.data[`${this.name}_original_text`] as string;
        if (originalTextForUseOriginal) {
          context.message.text = originalTextForUseOriginal;
        }
        this.logger?.info(`OpenRouterMiddleware ${this.name} using original message due to error`);
        await next();
        return;
      
      default:
        throw new Error(errorMessage); // Re-throw the error
    }
  }

  private getCacheKey(userMessage: string): string {
    // Create a hash of the user message and config for caching
    const systemPrompt = this.config.systemPrompt || this.config.prompt!;
    const content = `${this.config.model}:${systemPrompt}:${this.config.userPrompt || ''}:${userMessage}:${this.config.temperature}:${this.config.maxTokens}`;
    return createHash('sha256').update(content).digest('hex');
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheDuration!) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger?.debug(`OpenRouterMiddleware ${this.name} cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  public getCacheStats(): { size: number; entries: Array<{ key: string; age: number; tokens: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key: key.substring(0, 8) + '...', // Truncated key for privacy
      age: now - entry.timestamp,
      tokens: entry.tokens
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  /**
   * Clear the cache manually
   */
  public clearCache(): void {
    this.cache.clear();
    this.logger?.debug(`OpenRouterMiddleware ${this.name} cache cleared manually`);
  }
}