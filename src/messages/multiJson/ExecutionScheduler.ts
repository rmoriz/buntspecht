import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../utils/logger';
import type { TelemetryService } from '../../services/telemetryInterface';

const execAsync = promisify(exec);

/**
 * Handles command execution and timing logic for multi-JSON providers.
 * Responsible for running external commands and managing execution timing.
 */
export class ExecutionScheduler {
  private logger: Logger;
  private telemetry?: TelemetryService;

  constructor(logger: Logger, telemetry?: TelemetryService) {
    this.logger = logger;
    this.telemetry = telemetry;
  }

  /**
   * Executes a command and returns the JSON output
   */
  public async executeCommand(config: {
    command: string;
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
    maxBuffer?: number;
  }): Promise<unknown> {
    const startTime = Date.now();
    const span = this.telemetry?.startSpan('multijson.execute_command', {
      'command.name': config.command,
      'command.timeout': config.timeout || 30000,
    });

    try {
      this.logger.debug(`Executing command: ${config.command}`);

      const execOptions = {
        timeout: config.timeout || 30000,
        maxBuffer: config.maxBuffer || 1024 * 1024,
        cwd: config.cwd,
        env: config.env ? { ...process.env, ...config.env } : process.env,
      };

      const { stdout, stderr } = await execAsync(config.command, execOptions);

      if (stderr) {
        this.logger.warn(`Command stderr: ${stderr}`);
      }

      if (!stdout.trim()) {
        throw new Error('Command produced no output');
      }

      // Parse JSON output
      let jsonData: unknown;
      try {
        jsonData = JSON.parse(stdout);
      } catch (parseError) {
        throw new Error(`Failed to parse command output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      const durationMs = Date.now() - startTime;
      this.logger.debug(`Command executed successfully in ${durationMs}ms`);
      
      span?.setAttributes({
        'command.success': true,
        'command.duration_ms': durationMs,
        'command.output_size': stdout.length,
      });
      span?.setStatus({ code: 1 }); // OK

      return jsonData;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Command execution failed after ${durationMs}ms: ${errorMessage}`);
      
      span?.recordException(error as Error);
      span?.setAttributes({
        'command.success': false,
        'command.duration_ms': durationMs,
        'command.error': errorMessage,
      });
      span?.setStatus({ code: 2, message: errorMessage }); // ERROR

      throw error;
    } finally {
      span?.end();
    }
  }

  /**
   * Validates command configuration
   */
  public validateCommandConfig(config: {
    command: string;
    timeout?: number;
    maxBuffer?: number;
  }): void {
    if (!config.command || typeof config.command !== 'string' || config.command.trim() === '') {
      throw new Error('Command is required and must be a non-empty string');
    }

    if (config.timeout !== undefined && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
      throw new Error('Timeout must be a positive number');
    }

    if (config.maxBuffer !== undefined && (typeof config.maxBuffer !== 'number' || config.maxBuffer <= 0)) {
      throw new Error('MaxBuffer must be a positive number');
    }
  }

  /**
   * Creates a delay for throttling (if needed for backward compatibility)
   */
  public async delay(ms: number): Promise<void> {
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
}