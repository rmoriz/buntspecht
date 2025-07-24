import * as fs from 'fs';
import { Logger } from './logger';

/**
 * Utility class for watching file changes with debouncing and proper cleanup.
 * Eliminates code duplication between JsonCommandProvider and MultiJsonCommandProvider.
 */
export class FileWatcher {
  private filePath: string;
  private logger: Logger;
  private debounceMs: number;
  private lastFileChangeTime: number = 0;
  private lastFileContent?: string;
  private onFileChanged?: () => void;
  private fileWatcher?: fs.FSWatcher;

  constructor(filePath: string, logger: Logger, debounceMs: number = 1000) {
    this.filePath = filePath;
    this.logger = logger;
    this.debounceMs = debounceMs;
  }

  /**
   * Sets up the file watcher with debouncing and error handling
   */
  public setup(): void {
    // Skip file watching in test environment to prevent Jest worker issues
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      this.logger.debug(`Skipping file watcher setup in test environment for: ${this.filePath}`);
      return;
    }

    try {
      this.logger.info(`Setting up file watcher for: ${this.filePath}`);
      
      // Watch the file for changes using fs.watch (event-based, more efficient)
      this.fileWatcher = fs.watch(this.filePath, (eventType, _filename) => {
        // Only respond to 'change' events, ignore 'rename' events
        if (eventType === 'change') {
          this.handleFileChange();
        }
      });
      
      // Handle watcher errors
      this.fileWatcher.on('error', (error) => {
        this.logger.error(`File watcher error for ${this.filePath}: ${error.message}`);
      });
      
      // Store initial file content for comparison
      this.updateLastFileContent();
      
    } catch (error) {
      this.logger.error(`Failed to set up file watcher: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles file change events with debouncing
   */
  private handleFileChange(): void {
    const now = Date.now();
    
    // Debounce rapid file changes
    if (now - this.lastFileChangeTime < this.debounceMs) {
      this.logger.debug(`Debouncing file change for ${this.filePath} (${now - this.lastFileChangeTime}ms since last)`);
      return;
    }
    
    this.lastFileChangeTime = now;
    this.logger.info(`File changed: ${this.filePath}`);
    
    // Update the stored content
    this.updateLastFileContent();
    
    // Trigger file change callback if available
    if (this.onFileChanged) {
      this.onFileChanged();
    }
  }

  /**
   * Updates the stored file content for change detection
   */
  private updateLastFileContent(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        this.lastFileContent = fs.readFileSync(this.filePath, 'utf8');
      } catch (error) {
        this.logger.error(`Failed to read file content: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Checks if the file has changed since last read
   * @returns true if the file has changed, false otherwise
   */
  public hasFileChanged(): boolean {
    if (!fs.existsSync(this.filePath)) {
      return false;
    }

    try {
      const currentContent = fs.readFileSync(this.filePath, 'utf8');
      const hasChanged = currentContent !== this.lastFileContent;
      
      if (hasChanged) {
        this.lastFileContent = currentContent;
      }
      
      return hasChanged;
    } catch (error) {
      this.logger.error(`Failed to check file changes: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Sets the callback function to be called when the file changes
   * @param callback Function to call when file changes are detected
   */
  public setChangeCallback(callback: () => void): void {
    this.onFileChanged = callback;
  }

  /**
   * Gets the current file path being watched
   * @returns The file path
   */
  public getFilePath(): string {
    return this.filePath;
  }

  /**
   * Gets the debounce time in milliseconds
   * @returns The debounce time
   */
  public getDebounceMs(): number {
    return this.debounceMs;
  }

  /**
   * Sets a new debounce time
   * @param debounceMs New debounce time in milliseconds
   */
  public setDebounceMs(debounceMs: number): void {
    this.debounceMs = debounceMs;
  }

  /**
   * Cleans up the file watcher and releases resources
   */
  public cleanup(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.logger.info(`Stopped watching file: ${this.filePath}`);
      this.fileWatcher = undefined;
    }
  }

  /**
   * Checks if the file watcher is currently active
   * @returns true if watching, false otherwise
   */
  public isWatching(): boolean {
    return !!this.fileWatcher;
  }
}