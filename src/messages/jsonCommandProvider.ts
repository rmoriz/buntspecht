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
   * Supports syntax like {{variable}} and {{nested.property}}
   */
  private applyTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();
      const value = this.getNestedProperty(data, trimmedPath);
      
      if (value === undefined || value === null) {
        this.logger?.warn(`Template variable "${trimmedPath}" not found in JSON data`);
        return match; // Return the original placeholder if variable not found
      }
      
      return String(value);
    });
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