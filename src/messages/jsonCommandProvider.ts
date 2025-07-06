import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { TelemetryService } from '../services/telemetryInterface';

const execAsync = promisify(exec);

/**
 * Configuration for the JSON Command message provider
 */
export interface JsonCommandProviderConfig extends MessageProviderConfig {
  command: string;
  template: string;
  timeout?: number; // Timeout in milliseconds (default: 30000)
  cwd?: string; // Working directory for the command
  env?: Record<string, string>; // Environment variables
  maxBuffer?: number; // Maximum buffer size for stdout/stderr (default: 1024 * 1024)
}

/**
 * JSON Command message provider
 * Executes an external command, parses its stdout as JSON, and applies a template
 * with variables from the JSON data
 */
export class JsonCommandProvider implements MessageProvider {
  private command: string;
  private template: string;
  private timeout: number;
  private cwd?: string;
  private env?: Record<string, string>;
  private maxBuffer: number;
  private logger?: Logger;

  constructor(config: JsonCommandProviderConfig) {
    if (!config.command) {
      throw new Error('Command is required for JsonCommandProvider');
    }
    
    if (!config.template) {
      throw new Error('Template is required for JsonCommandProvider');
    }
    
    this.command = config.command;
    this.template = config.template;
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.cwd = config.cwd;
    this.env = config.env;
    this.maxBuffer = config.maxBuffer || 1024 * 1024; // 1MB default
  }

  /**
   * Generates the message by executing the configured command, parsing JSON output,
   * and applying the template
   */
  public async generateMessage(): Promise<string> {
    this.logger?.debug(`Executing command: "${this.command}"`);
    
    try {
      const options = {
        timeout: this.timeout,
        cwd: this.cwd,
        env: this.env ? { ...process.env, ...this.env } : process.env,
        maxBuffer: this.maxBuffer,
      };

      const { stdout, stderr } = await execAsync(this.command, options);
      
      if (stderr) {
        this.logger?.warn(`Command stderr: ${stderr.trim()}`);
      }

      const output = stdout.trim();
      
      if (!output) {
        throw new Error('Command produced no output');
      }

      this.logger?.debug(`Command output: "${output}"`);
      
      // Parse JSON output
      let jsonData: Record<string, unknown>;
      try {
        jsonData = JSON.parse(output);
      } catch (parseError) {
        const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(`Failed to parse command output as JSON: ${errorMessage}`);
      }

      // Apply template with JSON variables
      const message = this.applyTemplate(this.template, jsonData);
      
      this.logger?.debug(`Generated message: "${message}"`);
      return message;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`JSON command execution failed: ${errorMessage}`);
      throw new Error(`Failed to execute JSON command: ${errorMessage}`);
    }
  }

  /**
   * Applies a template string with variables from JSON data
   * Supports syntax like {{variable}}, {{nested.property}}, and {{variable|trim:50}}
   */
  private applyTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const trimmedExpression = expression.trim();
      
      // Check if expression contains a function call (pipe syntax)
      const pipeIndex = trimmedExpression.indexOf('|');
      let path: string;
      let functionCall: string | null = null;
      
      if (pipeIndex !== -1) {
        path = trimmedExpression.substring(0, pipeIndex).trim();
        functionCall = trimmedExpression.substring(pipeIndex + 1).trim();
      } else {
        path = trimmedExpression;
      }
      
      const value = this.getNestedProperty(data, path);
      
      if (value === undefined || value === null) {
        this.logger?.warn(`Template variable "${path}" not found in JSON data`);
        return match; // Return the original placeholder if variable not found
      }
      
      let result = String(value);
      
      // Apply function if specified
      if (functionCall) {
        result = this.applyTemplateFunction(result, functionCall, path);
      }
      
      return result;
    });
  }

  /**
   * Applies a template function to a value
   * Currently supports: trim:length
   */
  private applyTemplateFunction(value: string, functionCall: string, variablePath: string): string {
    const colonIndex = functionCall.indexOf(':');
    let functionName: string;
    let functionArgs: string[] = [];
    
    if (colonIndex !== -1) {
      functionName = functionCall.substring(0, colonIndex).trim();
      const argsString = functionCall.substring(colonIndex + 1);
      // Split by comma but preserve commas within the suffix argument
      const firstCommaIndex = argsString.indexOf(',');
      if (firstCommaIndex !== -1) {
        functionArgs = [
          argsString.substring(0, firstCommaIndex).trim(),
          argsString.substring(firstCommaIndex + 1).trim()
        ];
      } else {
        functionArgs = [argsString.trim()];
      }
    } else {
      functionName = functionCall.trim();
    }
    
    switch (functionName) {
      case 'trim':
        return this.trimFunction(value, functionArgs, variablePath);
      default:
        this.logger?.warn(`Unknown template function "${functionName}" for variable "${variablePath}"`);
        return value; // Return original value if function is unknown
    }
  }

  /**
   * Trims a string to a specified maximum length
   * Usage: {{variable|trim:50}} or {{variable|trim:50,...}}
   * Args: [maxLength, suffix?]
   */
  private trimFunction(value: string, args: string[], variablePath: string): string {
    if (args.length === 0) {
      this.logger?.warn(`trim function requires at least one argument (maxLength) for variable "${variablePath}"`);
      return value;
    }
    
    const maxLengthStr = args[0];
    const maxLength = parseInt(maxLengthStr, 10);
    
    if (isNaN(maxLength) || maxLength < 0) {
      this.logger?.warn(`Invalid maxLength "${maxLengthStr}" for trim function on variable "${variablePath}". Must be a non-negative integer.`);
      return value;
    }
    
    if (value.length <= maxLength) {
      return value; // No trimming needed
    }
    
    // Optional suffix (default: "...")
    const suffix = args.length > 1 ? args[1] : '...';
    
    // Special case: if maxLength is 0, return just the suffix (truncated if needed)
    if (maxLength === 0) {
      return suffix;
    }
    
    // Ensure the suffix doesn't make the result longer than maxLength
    const effectiveMaxLength = Math.max(0, maxLength - suffix.length);
    
    if (effectiveMaxLength <= 0) {
      // If suffix is longer than maxLength, just return the suffix truncated
      return suffix.substring(0, maxLength);
    }
    
    return value.substring(0, effectiveMaxLength) + suffix;
  }

  /**
   * Gets a nested property from an object using dot notation
   * e.g., "user.name" returns data.user.name
   */
  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  /**
   * Gets the provider name
   */
  public getProviderName(): string {
    return 'jsoncommand';
  }

  /**
   * Initialize the provider
   */
  public async initialize(logger: Logger, _telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    // JsonCommandProvider doesn't use telemetry currently
    this.logger.info(`Initialized JsonCommandProvider with command: "${this.command}"`);
    this.logger.info(`Template: "${this.template}"`);
    
    // Validate that the command can be executed by doing a dry run
    try {
      await this.generateMessage();
      this.logger.info('JSON command provider validation successful');
    } catch (error) {
      this.logger.warn(`JSON command provider validation failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw here - let it fail during actual execution
    }
  }
}