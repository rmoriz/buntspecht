import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';

export interface TemplateConfig {
  /** Template string with placeholders */
  template: string;
  /** Data source for template variables */
  dataSource?: 'context' | 'metadata' | 'environment' | 'static';
  /** Static data for template variables */
  staticData?: Record<string, unknown>;
  /** Environment variable prefix for data */
  envPrefix?: string;
  /** Whether to fail if template variables are missing */
  strictMode?: boolean;
  /** Default values for missing variables */
  defaults?: Record<string, string>;
}

/**
 * Middleware for applying templates to messages with variable substitution
 */
export class TemplateMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: TemplateConfig;
  private logger?: Logger;

  constructor(name: string, config: TemplateConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      dataSource: 'static',
      strictMode: false,
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized TemplateMiddleware: ${this.name} with template: "${this.config.template}"`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const originalText = context.message.text;
      
      // Get template data based on data source
      const templateData = this.getTemplateData(context);
      
      // Apply template
      const processedText = this.applyTemplate(this.config.template, templateData);
      
      // Update message
      context.message.text = processedText;
      
      if (originalText !== processedText) {
        this.logger?.debug(`TemplateMiddleware ${this.name} applied template`);
        context.data[`${this.name}_original_text`] = originalText;
        context.data[`${this.name}_template_applied`] = true;
        context.data[`${this.name}_template_data`] = templateData;
      }

      // Continue to next middleware
      await next();
    } catch (error) {
      this.logger?.error(`TemplateMiddleware ${this.name} failed:`, error);
      throw error;
    }
  }

  private getTemplateData(context: MessageMiddlewareContext): Record<string, unknown> {
    let data: Record<string, unknown> = {};

    switch (this.config.dataSource) {
      case 'context':
        data = {
          providerName: context.providerName,
          accountNames: context.accountNames,
          visibility: context.visibility,
          messageText: context.message.text,
          ...context.data
        };
        break;

      case 'metadata':
        data = {
          timestamp: new Date().toISOString(),
          date: new Date().toDateString(),
          time: new Date().toTimeString(),
          providerName: context.providerName,
          accountCount: context.accountNames.length,
          ...context.data
        };
        break;

      case 'environment':
        const prefix = this.config.envPrefix || '';
        for (const [key, value] of Object.entries(process.env)) {
          if (key.startsWith(prefix)) {
            const cleanKey = key.substring(prefix.length).toLowerCase();
            data[cleanKey] = value;
          }
        }
        break;

      case 'static':
      default:
        data = this.config.staticData || {};
        break;
    }

    // Add defaults for missing variables
    if (this.config.defaults) {
      for (const [key, defaultValue] of Object.entries(this.config.defaults)) {
        if (!(key in data)) {
          data[key] = defaultValue;
        }
      }
    }

    return data;
  }

  private applyTemplate(template: string, data: Record<string, unknown>): string {
    let result = template;

    // Replace {{variable}} patterns
    const variablePattern = /\{\{([^}]+)\}\}/g;
    
    result = result.replace(variablePattern, (match, variableName) => {
      const trimmedName = variableName.trim();
      
      // Support nested properties with dot notation
      const value = this.getNestedProperty(data, trimmedName);
      
      if (value !== undefined && value !== null) {
        return String(value);
      } else if (this.config.strictMode) {
        throw new Error(`Template variable '${trimmedName}' not found and strict mode is enabled`);
      } else {
        this.logger?.warn(`Template variable '${trimmedName}' not found, keeping placeholder`);
        return match; // Keep the original placeholder
      }
    });

    // Replace ${variable} patterns (alternative syntax)
    const altVariablePattern = /\$\{([^}]+)\}/g;
    
    result = result.replace(altVariablePattern, (match, variableName) => {
      const trimmedName = variableName.trim();
      const value = this.getNestedProperty(data, trimmedName);
      
      if (value !== undefined && value !== null) {
        return String(value);
      } else if (this.config.strictMode) {
        throw new Error(`Template variable '${trimmedName}' not found and strict mode is enabled`);
      } else {
        return match;
      }
    });

    return result;
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? (current as any)[key] : undefined;
    }, obj);
  }
}