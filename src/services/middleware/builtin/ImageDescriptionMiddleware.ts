import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';
import { Attachment } from '../../../messages/messageProvider';

export interface ImageDescriptionConfig {
  /** AI service provider */
  provider: 'openrouter' | 'openai' | 'anthropic';
  /** API key for the AI service */
  apiKey: string;
  /** AI model to use for image description */
  model: string;
  /** Custom prompt template for image description */
  prompt?: string;
  /** Maximum tokens for the response */
  maxTokens?: number;
  /** Temperature for response creativity (0.0 - 1.0) */
  temperature?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Whether to process only images without existing descriptions */
  onlyEmptyDescriptions?: boolean;
  /** Fallback behavior if AI fails */
  fallbackOnError?: 'skip' | 'continue' | 'use_filename';
  /** Retry configuration */
  retry?: {
    /** Maximum number of retry attempts */
    maxAttempts?: number;
    /** Initial delay in milliseconds */
    initialDelay?: number;
    /** Maximum delay in milliseconds */
    maxDelay?: number;
    /** Exponential backoff multiplier */
    backoffMultiplier?: number;
    /** Whether to enable retry logic */
    enabled?: boolean;
  };
  /** Supported image formats */
  supportedFormats?: string[];
  /** Maximum image size to process (in bytes) */
  maxImageSize?: number;
  /** Image resizing options */
  imageResize?: {
    /** Maximum width in pixels */
    maxWidth?: number;
    /** Maximum height in pixels */
    maxHeight?: number;
    /** JPEG quality (0-100) */
    quality?: number;
    /** Whether to enable resizing */
    enabled?: boolean;
  };
}

interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: {
        url: string;
        detail?: 'low' | 'high' | 'auto';
      };
    }>;
  }>;
  max_tokens?: number;
  temperature?: number;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Middleware for generating AI-powered descriptions of images in message attachments
 */
export class ImageDescriptionMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private readonly config: ImageDescriptionConfig;
  private logger?: Logger;
  private telemetry?: TelemetryService;

  constructor(name: string, config: ImageDescriptionConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      timeout: 30000,
      maxTokens: 1500,
      temperature: 0.3,
      onlyEmptyDescriptions: true,
      fallbackOnError: 'continue',
      retry: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 1000, // 1 second
        maxDelay: 30000, // 30 seconds
        backoffMultiplier: 2
      },
      supportedFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      maxImageSize: 20 * 1024 * 1024, // 20MB
      imageResize: {
        enabled: true,
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 75
      },
      prompt: 'Describe this image in a concise, accessible way for social media. Focus on the main subject, key visual elements, and any text visible in the image. Keep it under 100 characters.',
      ...config
    };

    // Validate required config
    if (!this.config.apiKey) {
      throw new Error('ImageDescription API key is required');
    }
    if (!this.config.model) {
      throw new Error('ImageDescription model is required');
    }
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.logger.debug(`Initialized ImageDescriptionMiddleware: ${this.name} with model: ${this.config.model}`);
  }

  public async cleanup(): Promise<void> {
    // No cleanup needed without caching
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    if (!context.message.attachments || context.message.attachments.length === 0) {
      await next();
      return;
    }

    const imageAttachments = context.message.attachments.filter(attachment => 
      this.isImageAttachment(attachment) && this.shouldProcessAttachment(attachment)
    );

    if (imageAttachments.length === 0) {
      this.logger?.debug(`ImageDescriptionMiddleware ${this.name}: No processable images found`);
      await next();
      return;
    }

    this.logger?.debug(`ImageDescriptionMiddleware ${this.name}: Processing ${imageAttachments.length} image(s)`);

    try {
      // Process each image attachment
      for (const attachment of imageAttachments) {
        await this.processImageAttachment(attachment);
      }

      this.telemetry?.incrementCounter('image_description.processed', imageAttachments.length, {
        middleware: this.name,
        provider: this.config.provider,
        model: this.config.model
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error(`ImageDescriptionMiddleware ${this.name} error:`, error);
      
      this.telemetry?.incrementCounter('image_description.error', 1, {
        middleware: this.name,
        error: errorMessage
      });

      await this.handleError(errorMessage, context);
    }

    await next();
  }

  private isImageAttachment(attachment: Attachment): boolean {
    return this.config.supportedFormats!.includes(attachment.mimeType);
  }

  private shouldProcessAttachment(attachment: Attachment): boolean {
    // Check if we should only process images without descriptions
    if (this.config.onlyEmptyDescriptions && attachment.description && attachment.description.trim() !== '') {
      return false;
    }

    // Check image size
    if (this.config.maxImageSize) {
      const estimatedSize = Math.floor((attachment.data.length * 3) / 4); // Base64 to bytes
      if (estimatedSize > this.config.maxImageSize) {
        this.logger?.warn(`Image too large: ${estimatedSize} bytes > ${this.config.maxImageSize} bytes`);
        return false;
      }
    }

    return true;
  }

  private async processImageAttachment(attachment: Attachment): Promise<void> {
    try {
      const description = await this.generateImageDescription(attachment);
      attachment.description = description;

      this.logger?.debug(`Generated description for ${attachment.filename || 'unnamed'}: ${description}`);

    } catch (error) {
      this.logger?.error(`Failed to generate description for image ${attachment.filename || 'unnamed'}:`, error);
      
      // Apply fallback strategy
      switch (this.config.fallbackOnError) {
        case 'use_filename':
          if (attachment.filename) {
            attachment.description = `Image: ${attachment.filename}`;
          }
          break;
        case 'skip':
          throw error;
        case 'continue':
        default:
          // Keep existing description or leave empty
          break;
      }
    }
  }

  private async generateImageDescription(attachment: Attachment): Promise<string> {
    // Resize image if enabled
    let processedData = attachment.data;
    let processedMimeType = attachment.mimeType;
    
    if (this.config.imageResize?.enabled) {
      try {
        const resizeResult = await this.resizeImage(attachment.data, attachment.mimeType);
        processedData = resizeResult.data;
        processedMimeType = resizeResult.mimeType;
        
        this.logger?.debug(`Resized image ${attachment.filename || 'unnamed'}: ${attachment.data.length} -> ${processedData.length} chars`);
      } catch (error) {
        this.logger?.warn(`Failed to resize image ${attachment.filename || 'unnamed'}, using original:`, error);
        // Continue with original image
      }
    }

    const dataUrl = `data:${processedMimeType};base64,${processedData}`;

    const requestBody: OpenRouterRequest = {
      model: this.config.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: this.config.prompt!
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'auto'
              }
            }
          ]
        }
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    };

    const apiUrl = this.getApiUrl();
    const headers = this.getApiHeaders();

    this.logger?.debug(`ImageDescriptionMiddleware ${this.name} - Making API request`, {
      model: this.config.model,
      provider: this.config.provider,
      imageType: processedMimeType,
      imageSize: processedData.length
    });

    const data = await this.makeApiRequestWithRetry(apiUrl, headers, requestBody, attachment);
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response choices returned from AI API');
    }

    const description = data.choices[0].message.content.trim();
    
    this.telemetry?.incrementCounter('image_description.api_call', 1, {
      middleware: this.name,
      provider: this.config.provider,
      model: this.config.model,
      tokens_used: data.usage?.total_tokens || 0
    });

    return description;
  }

  private async makeApiRequestWithRetry(
    apiUrl: string, 
    headers: Record<string, string>, 
    requestBody: OpenRouterRequest,
    attachment: Attachment
  ): Promise<OpenRouterResponse> {
    const retryConfig = this.config.retry!;
    
    if (!retryConfig.enabled) {
      // No retry logic, make single request
      return await this.makeSingleApiRequest(apiUrl, headers, requestBody);
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts!; attempt++) {
      try {
        this.logger?.debug(`ImageDescriptionMiddleware ${this.name} - API attempt ${attempt}/${retryConfig.maxAttempts}`);
        
        const result = await this.makeSingleApiRequest(apiUrl, headers, requestBody);
        
        // Success! Log if this was a retry
        if (attempt > 1) {
          this.logger?.info(`ImageDescriptionMiddleware ${this.name} - API call succeeded on attempt ${attempt} for ${attachment.filename || 'unnamed'}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on the last attempt
        if (attempt === retryConfig.maxAttempts) {
          break;
        }
        
        // Check if this is a retryable error
        if (!this.isRetryableError(lastError)) {
          this.logger?.debug(`ImageDescriptionMiddleware ${this.name} - Non-retryable error, not retrying: ${lastError.message}`);
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.initialDelay! * Math.pow(retryConfig.backoffMultiplier!, attempt - 1),
          retryConfig.maxDelay!
        );
        
        this.logger?.warn(`ImageDescriptionMiddleware ${this.name} - API attempt ${attempt} failed for ${attachment.filename || 'unnamed'}: ${lastError.message}. Retrying in ${delay}ms...`);
        
        // Wait before retry
        await this.sleep(delay);
      }
    }
    
    // All attempts failed
    this.logger?.error(`ImageDescriptionMiddleware ${this.name} - All ${retryConfig.maxAttempts} API attempts failed for ${attachment.filename || 'unnamed'}`);
    throw lastError || new Error('All retry attempts failed');
  }

  private async makeSingleApiRequest(
    apiUrl: string, 
    headers: Record<string, string>, 
    requestBody: OpenRouterRequest
  ): Promise<OpenRouterResponse> {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json() as OpenRouterResponse;
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retry on timeout errors
    if (error.name === 'TimeoutError' || message.includes('timeout')) {
      return true;
    }
    
    // Retry on network errors
    if (message.includes('network') || message.includes('fetch')) {
      return true;
    }
    
    // Retry on 5xx server errors
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }
    
    // Retry on rate limiting (429)
    if (message.includes('429') || message.includes('rate limit')) {
      return true;
    }
    
    // Don't retry on 4xx client errors (except 429)
    if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
      return false;
    }
    
    // Default to retry for unknown errors
    return true;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getApiUrl(): string {
    switch (this.config.provider) {
      case 'openrouter':
        return 'https://openrouter.ai/api/v1/chat/completions';
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'anthropic':
        return 'https://api.anthropic.com/v1/messages';
      default:
        throw new Error(`Unsupported AI provider: ${this.config.provider}`);
    }
  }

  private getApiHeaders(): Record<string, string> {
    const baseHeaders = {
      'Content-Type': 'application/json'
    };

    switch (this.config.provider) {
      case 'openrouter':
        return {
          ...baseHeaders,
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/rmoriz/buntspecht',
          'X-Title': 'Buntspecht Social Media Bot'
        };
      case 'openai':
        return {
          ...baseHeaders,
          'Authorization': `Bearer ${this.config.apiKey}`
        };
      case 'anthropic':
        return {
          ...baseHeaders,
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        };
      default:
        throw new Error(`Unsupported AI provider: ${this.config.provider}`);
    }
  }

  private async resizeImage(base64Data: string, mimeType: string): Promise<{ data: string; mimeType: string }> {
    // For now, we'll use a simple Canvas-based approach that works in Node.js
    // This requires the 'canvas' package, but we'll implement a fallback
    
    try {
      // Try to use canvas package if available
      const { createCanvas, loadImage } = await import('canvas');
      
      // Decode base64 to buffer
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Load image
      const image = await loadImage(imageBuffer);
      
      // Calculate new dimensions
      const { maxWidth = 2048, maxHeight = 2048, quality = 75 } = this.config.imageResize!;
      
      let { width, height } = image;
      
      // Calculate scale factor to fit within max dimensions
      const scaleX = maxWidth / width;
      const scaleY = maxHeight / height;
      const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
      
      const newWidth = Math.floor(width * scale);
      const newHeight = Math.floor(height * scale);
      
      // Skip resizing if image is already small enough
      if (scale >= 1) {
        return { data: base64Data, mimeType };
      }
      
      // Create canvas and resize
      const canvas = createCanvas(newWidth, newHeight);
      const ctx = canvas.getContext('2d');
      
      ctx.drawImage(image, 0, 0, newWidth, newHeight);
      
      // Convert to JPEG with quality setting
      const resizedBuffer = canvas.toBuffer('image/jpeg', { quality: quality / 100 });
      const resizedBase64 = resizedBuffer.toString('base64');
      
      return {
        data: resizedBase64,
        mimeType: 'image/jpeg'
      };
      
    } catch (error) {
      // Fallback: if canvas is not available, return original
      this.logger?.debug('Canvas package not available for image resizing, using original image');
      return { data: base64Data, mimeType };
    }
  }

  private async handleError(errorMessage: string, context: MessageMiddlewareContext): Promise<void> {
    switch (this.config.fallbackOnError) {
      case 'skip':
        context.skip = true;
        this.logger?.info(`ImageDescriptionMiddleware ${this.name} skipping message due to error: ${errorMessage}`);
        return;
      
      case 'continue':
      default:
        this.logger?.info(`ImageDescriptionMiddleware ${this.name} continuing despite error: ${errorMessage}`);
        return;
    }
  }
}
