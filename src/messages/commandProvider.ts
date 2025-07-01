import { MessageProvider, MessageProviderConfig } from './messageProvider';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { TelemetryService } from '../services/telemetryInterface';

const execAsync = promisify(exec);

/**
 * Configuration for the Command message provider
 */
export interface CommandProviderConfig extends MessageProviderConfig {
  command: string;
  timeout?: number; // Timeout in milliseconds (default: 30000)
  cwd?: string; // Working directory for the command
  env?: Record<string, string>; // Environment variables
  maxBuffer?: number; // Maximum buffer size for stdout/stderr (default: 1024 * 1024)
}

/**
 * Command message provider
 * Executes an external command and uses its stdout as the message content
 */
export class CommandProvider implements MessageProvider {
  private command: string;
  private timeout: number;
  private cwd?: string;
  private env?: Record<string, string>;
  private maxBuffer: number;
  private logger?: Logger;

  constructor(config: CommandProviderConfig) {
    if (!config.command) {
      throw new Error('Command is required for CommandProvider');
    }
    
    this.command = config.command;
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.cwd = config.cwd;
    this.env = config.env;
    this.maxBuffer = config.maxBuffer || 1024 * 1024; // 1MB default
  }

  /**
   * Generates the message by executing the configured command
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

      const message = stdout.trim();
      
      if (!message) {
        throw new Error('Command produced no output');
      }

      this.logger?.debug(`Command output: "${message}"`);
      return message;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Command execution failed: ${errorMessage}`);
      throw new Error(`Failed to execute command: ${errorMessage}`);
    }
  }

  /**
   * Gets the provider name
   */
  public getProviderName(): string {
    return 'command';
  }

  /**
   * Initialize the provider
   */
  public async initialize(logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    // CommandProvider doesn't use telemetry currently
    this.logger.info(`Initialized CommandProvider with command: "${this.command}"`);
    
    // Validate that the command can be executed by doing a dry run
    try {
      await this.generateMessage();
      this.logger.info('Command provider validation successful');
    } catch (error) {
      this.logger.warn(`Command provider validation failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw here - let it fail during actual execution
    }
  }
}