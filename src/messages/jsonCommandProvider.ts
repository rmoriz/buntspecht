import { MessageProvider, MessageProviderConfig, MessageWithAttachments } from './messageProvider';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { JsonTemplateProcessor, AttachmentConfig } from '../utils/jsonTemplateProcessor';
import { promisify } from 'util';
import type { TelemetryService } from '../services/telemetryInterface';
import { TelemetryHelper } from '../utils/telemetryHelper';
import { FileWatcher } from '../utils/fileWatcher';
import * as fs from 'fs';

const execAsync = promisify(exec);

/**
 * Configuration for the JSON Command message provider
 */
export interface JsonCommandProviderConfig extends MessageProviderConfig {
  command?: string; // Command to execute (mutually exclusive with file)
  file?: string; // Path to JSON file (mutually exclusive with command)
  template: string;
  timeout?: number; // Timeout in milliseconds (default: 30000)
  cwd?: string; // Working directory for the command
  env?: Record<string, string>; // Environment variables
  maxBuffer?: number; // Maximum buffer size for stdout/stderr (default: 1024 * 1024)
  attachmentsKey?: string; // JSON key containing base64 attachments array (optional)
  attachmentDataKey?: string; // JSON key for base64 data within each attachment (default: "data")
  attachmentMimeTypeKey?: string; // JSON key for MIME type within each attachment (default: "mimeType", fallback: "type")
  attachmentFilenameKey?: string; // JSON key for filename within each attachment (default: "filename", fallback: "name")
  attachmentDescriptionKey?: string; // JSON key for description within each attachment (default: "description", fallback: "alt")
}

/**
 * JSON Command message provider
 * Executes an external command, parses its stdout as JSON, and applies a template
 * with variables from the JSON data
 */
export class JsonCommandProvider implements MessageProvider {
  private command?: string;
  private file?: string;
  private template: string;
  private timeout: number;
  private cwd?: string;
  private env?: Record<string, string>;
  private maxBuffer: number;
  private attachmentsKey?: string;
  private attachmentDataKey: string;
  private attachmentMimeTypeKey: string;
  private attachmentFilenameKey: string;
  private attachmentDescriptionKey: string;
  private logger?: Logger;
  private telemetry?: TelemetryService;
  private templateProcessor: JsonTemplateProcessor;
  private fileWatcher?: FileWatcher;

  constructor(config: JsonCommandProviderConfig) {
    // Validate that either command or file is provided, but not both
    if (!config.command && !config.file) {
      throw new Error('Either command or file is required for JsonCommandProvider');
    }
    
    if (config.command && config.file) {
      throw new Error('Cannot specify both command and file for JsonCommandProvider');
    }
    
    if (!config.template) {
      throw new Error('Template is required for JsonCommandProvider');
    }
    
    this.command = config.command;
    this.file = config.file;
    this.template = config.template;
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.cwd = config.cwd;
    this.env = config.env;
    this.maxBuffer = config.maxBuffer || 1024 * 1024; // 1MB default
    this.attachmentsKey = config.attachmentsKey;
    this.attachmentDataKey = config.attachmentDataKey || 'data';
    this.attachmentMimeTypeKey = config.attachmentMimeTypeKey || 'mimeType';
    this.attachmentFilenameKey = config.attachmentFilenameKey || 'filename';
    this.attachmentDescriptionKey = config.attachmentDescriptionKey || 'description';
    this.templateProcessor = new JsonTemplateProcessor(this.logger || new Logger());
  }

  /**
   * Generates the message by executing the configured command, parsing JSON output,
   * and applying the template
   */
  public async generateMessage(): Promise<string> {
    const result = await this.generateMessageWithAttachments();
    return result.text;
  }

  /**
   * Generates the message with attachments by executing the configured command or reading the file,
   * parsing JSON output, and applying the template
   */
  public async generateMessageWithAttachments(): Promise<MessageWithAttachments> {
    if (this.telemetry) {
      return await TelemetryHelper.executeWithSpan(
        this.telemetry,
        'jsoncommand.generate_message',
        { 
          provider: 'JsonCommandProvider',
          hasCommand: !!this.command,
          hasFile: !!this.file
        },
        () => this.executeGenerateMessage()
      );
    }
    
    return this.executeGenerateMessage();
  }

  /**
   * Internal method to execute message generation
   */
  private async executeGenerateMessage(): Promise<MessageWithAttachments> {
    let jsonData: Record<string, unknown>;
    
    if (this.command) {
      // Execute command
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
        try {
          jsonData = JSON.parse(output);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(`Failed to parse command output as JSON: ${errorMessage}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger?.error(`JSON command execution failed: ${errorMessage}`);
        throw new Error(`Failed to execute JSON command: ${errorMessage}`);
      }
    } else if (this.file) {
      // Read file
      this.logger?.debug(`Reading JSON file: "${this.file}"`);
      
      try {
        if (!fs.existsSync(this.file)) {
          throw new Error(`File does not exist: ${this.file}`);
        }
        
        const fileContent = fs.readFileSync(this.file, 'utf8');
        
        if (!fileContent.trim()) {
          throw new Error('File is empty');
        }

        this.logger?.debug(`File content length: ${fileContent.length} characters`);
        
        // Parse JSON content
        try {
          jsonData = JSON.parse(fileContent);
        } catch (parseError) {
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(`Failed to parse file content as JSON: ${errorMessage}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger?.error(`JSON file reading failed: ${errorMessage}`);
        throw new Error(`Failed to read JSON file: ${errorMessage}`);
      }
    } else {
      throw new Error('Neither command nor file is configured');
    }

      // Apply template with JSON variables
      const message = this.templateProcessor.applyTemplate(this.template, jsonData);
      
      // Extract attachments if configured
      const attachmentConfig: AttachmentConfig = {
        attachmentsKey: this.attachmentsKey,
        attachmentDataKey: this.attachmentDataKey,
        attachmentMimeTypeKey: this.attachmentMimeTypeKey,
        attachmentFilenameKey: this.attachmentFilenameKey,
        attachmentDescriptionKey: this.attachmentDescriptionKey
      };
      const attachments = this.templateProcessor.extractAttachments(jsonData, attachmentConfig);
      
      this.logger?.debug(`Generated message: "${message}"`);
      if (attachments.length > 0) {
        this.logger?.debug(`Found ${attachments.length} attachments`);
      }
      
    return {
      text: message,
      attachments: attachments.length > 0 ? attachments : undefined
    };
  }


  /**
   * Warm the cache (not applicable for this provider)
   */
  public async warmCache(): Promise<void> {
    this.logger?.info('Cache warming is not applicable for JsonCommandProvider');
    return Promise.resolve();
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
  public async initialize(logger: Logger, telemetry?: TelemetryService): Promise<void> {
    this.logger = logger;
    this.telemetry = telemetry;
    this.templateProcessor = new JsonTemplateProcessor(this.logger);
    
    if (this.command) {
      this.logger.info(`Initialized JsonCommandProvider with command: "${this.command}"`);
    } else if (this.file) {
      this.logger.info(`Initialized JsonCommandProvider with file: "${this.file}"`);
      
      // Set up file watching if no cron schedule is provided
      // Note: This assumes the provider will be used without cron scheduling
      // The actual cron check should be done by the caller
      this.setupFileWatcher();
    }
    
    this.logger.info(`Template: "${this.template}"`);
    
    // Validate that the provider can generate a message by doing a dry run
    try {
      await this.generateMessage();
      this.logger.info('JSON command/file provider validation successful');
    } catch (error) {
      this.logger.warn(`JSON command/file provider validation failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw here - let it fail during actual execution
    }
  }

  /**
   * Set up file watcher for automatic change detection
   */
  private setupFileWatcher(): void {
    if (!this.file || !this.logger) {
      return;
    }

    this.fileWatcher = new FileWatcher(this.file, this.logger);
    this.fileWatcher.setup();
  }

  /**
   * Check if file has changed since last read
   */
  public hasFileChanged(): boolean {
    return this.fileWatcher?.hasFileChanged() || false;
  }

  /**
   * Set callback for file changes
   */
  public setFileChangeCallback(callback: () => void): void {
    this.fileWatcher?.setChangeCallback(callback);
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.fileWatcher?.cleanup();
  }
}