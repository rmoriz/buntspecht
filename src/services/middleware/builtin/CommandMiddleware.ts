import { MessageMiddleware, MessageMiddlewareContext } from '../types';
import { Logger } from '../../../utils/logger';
import { TelemetryService } from '../../telemetryInterface';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CommandConfig {
  /** Command to execute */
  command: string;
  /** How to use the command output: 'replace' (replace message), 'prepend', 'append', 'validate' (skip if command fails) */
  mode: 'replace' | 'prepend' | 'append' | 'validate';
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Maximum buffer size for stdout/stderr (default: 1024 * 1024) */
  maxBuffer?: number;
  /** Whether to pass the original message as stdin to the command */
  useStdin?: boolean;
  /** Whether to pass message as environment variable MESSAGE_TEXT */
  useEnvVar?: boolean;
  /** Skip message if command fails (for validate mode) */
  skipOnFailure?: boolean;
  /** Custom skip reason when command fails */
  skipReason?: string;
}

/**
 * Middleware for executing external commands to transform or validate messages
 */
export class CommandMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;
  private config: CommandConfig;
  private logger?: Logger;

  constructor(name: string, config: CommandConfig, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    this.config = {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      ...config
    };
  }

  public async initialize(logger: Logger, telemetry: TelemetryService): Promise<void> {
    this.logger = logger;
    this.logger.debug(`Initialized CommandMiddleware: ${this.name} with command: "${this.config.command}" mode: ${this.config.mode}`);
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    try {
      const originalText = context.message.text;
      
      this.logger?.debug(`CommandMiddleware ${this.name} executing command: "${this.config.command}"`);
      
      const options = {
        timeout: this.config.timeout,
        cwd: this.config.cwd,
        env: this.buildEnvironment(originalText),
        maxBuffer: this.config.maxBuffer,
      };

      let commandResult: { stdout: string; stderr: string };

      if (this.config.useStdin) {
        // Execute command with message as stdin
        commandResult = await this.executeWithStdin(this.config.command, originalText, options);
      } else {
        // Execute command normally
        commandResult = await execAsync(this.config.command, options);
      }

      if (commandResult.stderr) {
        this.logger?.warn(`CommandMiddleware ${this.name} stderr: ${commandResult.stderr.trim()}`);
      }

      const output = commandResult.stdout.trim();

      // Process based on mode
      switch (this.config.mode) {
        case 'replace':
          if (output) {
            context.message.text = output;
            this.logger?.debug(`CommandMiddleware ${this.name} replaced message with command output`);
            context.data[`${this.name}_original_text`] = originalText;
            context.data[`${this.name}_replaced`] = true;
          }
          break;

        case 'prepend':
          if (output) {
            context.message.text = output + originalText;
            this.logger?.debug(`CommandMiddleware ${this.name} prepended command output to message`);
            context.data[`${this.name}_prepended`] = output;
          }
          break;

        case 'append':
          if (output) {
            context.message.text = originalText + output;
            this.logger?.debug(`CommandMiddleware ${this.name} appended command output to message`);
            context.data[`${this.name}_appended`] = output;
          }
          break;

        case 'validate':
          // For validate mode, command success/failure determines if message should be skipped
          this.logger?.debug(`CommandMiddleware ${this.name} validation passed`);
          context.data[`${this.name}_validated`] = true;
          break;
      }

      // Continue to next middleware
      await next();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`CommandMiddleware ${this.name} command failed: ${errorMessage}`);

      if (this.config.mode === 'validate' && this.config.skipOnFailure) {
        context.skip = true;
        context.skipReason = this.config.skipReason || `Command validation failed: ${errorMessage}`;
        this.logger?.info(`CommandMiddleware ${this.name} skipped message: ${context.skipReason}`);
        context.data[`${this.name}_validation_failed`] = true;
        context.data[`${this.name}_error`] = errorMessage;
        return; // Don't call next() - stop the chain
      }

      // For other modes, re-throw the error
      throw error;
    }
  }

  private buildEnvironment(messageText: string): Record<string, string> {
    const env = { ...process.env };
    
    if (this.config.env) {
      Object.assign(env, this.config.env);
    }
    
    if (this.config.useEnvVar) {
      env.MESSAGE_TEXT = messageText;
    }
    
    return env as Record<string, string>;
  }

  private async executeWithStdin(command: string, input: string, options: any): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        }
      });

      // Write input to stdin and close it
      if (child.stdin) {
        child.stdin.write(input);
        child.stdin.end();
      }
    });
  }
}