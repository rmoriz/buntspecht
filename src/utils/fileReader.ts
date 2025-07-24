import * as fs from 'fs';
import { Logger } from './logger';

/**
 * Configuration for robust file reading
 */
export interface FileReadOptions {
  /** Maximum number of retry attempts for empty files (default: 3) */
  maxRetries?: number;
  /** Delay between retries in milliseconds (default: 100) */
  retryDelay?: number;
  /** Whether to treat empty files as an error or return null (default: false - return null) */
  throwOnEmpty?: boolean;
  /** Minimum file size to consider valid (default: 1 byte) */
  minFileSize?: number;
}

/**
 * Utility for robust file reading with retry logic for handling transient empty files.
 * This is common when files are being written by external processes.
 */
export class FileReader {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Reads a file with retry logic for handling transient empty files
   * @param filePath Path to the file to read
   * @param options Configuration options for file reading
   * @returns File content as string, or null if file is empty and throwOnEmpty is false
   */
  public async readFileRobust(filePath: string, options: FileReadOptions = {}): Promise<string | null> {
    const {
      maxRetries = 3,
      retryDelay = 100,
      throwOnEmpty = false,
      minFileSize = 1
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          throw new Error(`File does not exist: ${filePath}`);
        }

        // Get file stats to check size
        const stats = fs.statSync(filePath);
        
        // If file is too small, handle based on configuration
        if (stats.size < minFileSize) {
          const message = `File is empty or too small (${stats.size} bytes, minimum: ${minFileSize})`;
          
          if (attempt < maxRetries) {
            this.logger.debug(`${message}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
            await this.delay(retryDelay);
            continue;
          }
          
          if (throwOnEmpty) {
            throw new Error(message);
          } else {
            this.logger.debug(`${message}, returning null`);
            return null;
          }
        }

        // Read file content
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        // Double-check content is not just whitespace
        if (!fileContent.trim()) {
          const message = 'File contains only whitespace';
          
          if (attempt < maxRetries) {
            this.logger.debug(`${message}, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
            await this.delay(retryDelay);
            continue;
          }
          
          if (throwOnEmpty) {
            throw new Error(message);
          } else {
            this.logger.debug(`${message}, returning null`);
            return null;
          }
        }

        this.logger.debug(`Successfully read file: ${filePath} (${fileContent.length} characters)`);
        return fileContent;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          this.logger.debug(`File read attempt ${attempt}/${maxRetries} failed: ${lastError.message}, retrying in ${retryDelay}ms`);
          await this.delay(retryDelay);
        } else {
          this.logger.error(`File read failed after ${maxRetries} attempts: ${lastError.message}`);
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('File read failed for unknown reason');
  }

  /**
   * Reads and parses a JSON file with retry logic
   * @param filePath Path to the JSON file
   * @param options Configuration options for file reading
   * @returns Parsed JSON data, or null if file is empty and throwOnEmpty is false
   */
  public async readJsonFileRobust(filePath: string, options: FileReadOptions = {}): Promise<unknown | null> {
    const fileContent = await this.readFileRobust(filePath, options);
    
    if (fileContent === null) {
      return null;
    }

    try {
      return JSON.parse(fileContent);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      this.logger.error(`Failed to parse JSON from ${filePath}: ${errorMessage}`);
      throw new Error(`Failed to parse JSON from ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Simple delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Checks if a file is likely being written to by checking if its size changes
   * @param filePath Path to the file to check
   * @param checkInterval Time to wait between size checks in milliseconds (default: 50)
   * @returns true if file size is stable, false if it's changing
   */
  public async isFileStable(filePath: string, checkInterval: number = 50): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const initialStats = fs.statSync(filePath);
      await this.delay(checkInterval);
      const secondStats = fs.statSync(filePath);
      
      return initialStats.size === secondStats.size && 
             initialStats.mtime.getTime() === secondStats.mtime.getTime();
    } catch (error) {
      this.logger.debug(`Error checking file stability: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}