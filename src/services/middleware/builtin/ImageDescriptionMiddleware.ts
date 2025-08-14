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
  /** Whether to cache descriptions to avoid duplicate API calls */
  enableCaching?: boolean;
  /** Cache duration in milliseconds */
  cacheDuration?: number;
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

interface CacheEntry {
  description: string;
  timestamp: number;
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
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(name: string, config: ImageDescriptionConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      timeout: 30000,
      maxTokens: 150,
      temperature: 0.3,
      onlyEmptyDescriptions: true,
      fallbackOnError: 'continue',
      enableCaching: true,
      cacheDuration: 24 * 60 * 60 * 1000, // 24 hours
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

    // Start cache cleanup if caching is enabled
    if (this.config.enableCaching) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupCache();
      }, this.config.cacheDuration! / 4);
    }
  }

  public async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
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
    const cacheKey = this.getCacheKey(attachment);
    
    // Check cache first
    if (this.config.enableCaching && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < this.config.cacheDuration!) {
        attachment.description = cached.description;
        this.logger?.debug(`Using cached description for image: ${attachment.filename || 'unnamed'}`);
        return;
      }
    }

    try {
      const description = await this.generateImageDescription(attachment);
      attachment.description = description;

      // Cache the result
      if (this.config.enableCaching) {
        this.cache.set(cacheKey, {
          description,
          timestamp: Date.now()
        });
      }

      this.logger?.debug(`Generated description for ${attachment.filename || 'unnamed'}: ${description}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
      imageType: attachment.mimeType,
      imageSize: attachment.data.length
    });

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

    const data = await response.json() as OpenRouterResponse;
    
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

  private getCacheKey(attachment: Attachment): string {
    // Create a hash of the image data and config for caching
    const crypto = require('crypto');
    const content = `${this.config.model}:${this.config.prompt}:${attachment.data.substring(0, 100)}`;
    return crypto.createHash('sha256').update(content).digest('hex');
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
      this.logger?.debug(`ImageDescriptionMiddleware ${this.name} cleaned up ${cleanedCount} expired cache entries`);
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

  /**
   * Get cache statistics for debugging
   */
  public getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key: key.substring(0, 8) + '...',
      age: now - entry.timestamp
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
    this.logger?.debug(`ImageDescriptionMiddleware ${this.name} cache cleared manually`);
  }
}