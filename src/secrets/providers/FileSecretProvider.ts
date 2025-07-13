import * as fs from 'fs';
import * as path from 'path';
import { BaseSecretProvider } from './BaseSecretProvider';

/**
 * File-based secret provider for reading secrets from local files
 * 
 * Supported formats:
 * - file:///absolute/path/to/secret.txt
 * - file://./relative/path/to/secret.txt
 * - file://secret.txt (relative to current directory)
 */
export class FileSecretProvider extends BaseSecretProvider {
  public readonly name = 'file';

  protected async initializeProvider(): Promise<void> {
    // No special initialization needed for file provider
    this.logger?.debug('File secret provider initialized');
  }

  public canHandle(source: string): boolean {
    return source.startsWith('file://');
  }

  protected async resolveSecret(source: string): Promise<string> {
    const filePath = this.parseFilePath(source);
    
    try {
      // Check if file exists and is readable
      await fs.promises.access(filePath, fs.constants.R_OK);
      
      // Read the file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      
      // Trim whitespace and newlines
      const secret = content.trim();
      
      if (secret.length === 0) {
        throw new Error(`Secret file is empty: ${filePath}`);
      }
      
      return secret;
      
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        switch (error.code) {
          case 'ENOENT':
            throw new Error(`Secret file not found: ${filePath}`);
          case 'EACCES':
            throw new Error(`Permission denied reading secret file: ${filePath}`);
          case 'EISDIR':
            throw new Error(`Path is a directory, not a file: ${filePath}`);
          default:
            throw new Error(`Failed to read secret file ${filePath}: ${error.message}`);
        }
      }
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      // Test by checking if we can access the current directory
      await fs.promises.access('.', fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  protected async cleanupProvider(): Promise<void> {
    // No cleanup needed for file provider
  }

  /**
   * Parse file path from the source URL
   */
  private parseFilePath(source: string): string {
    if (!source.startsWith('file://')) {
      throw new Error(`Invalid file source format: ${source}`);
    }
    
    let filePath = source.substring(7); // Remove 'file://'
    
    // Handle different path formats
    if (filePath.startsWith('/')) {
      // Absolute path: file:///absolute/path
      return filePath;
    } else {
      // Relative path: file://./relative/path or file://filename
      if (filePath.startsWith('./')) {
        filePath = filePath.substring(2);
      }
      return path.resolve(filePath);
    }
  }

  protected maskSource(source: string): string {
    try {
      const filePath = this.parseFilePath(source);
      const dir = path.dirname(filePath);
      const filename = path.basename(filePath);
      
      // Show directory and mask filename
      if (filename.length > 8) {
        const maskedFilename = filename.substring(0, 3) + '***' + filename.substring(filename.length - 3);
        return `file://${dir}/${maskedFilename}`;
      }
      return `file://${dir}/***`;
    } catch {
      return 'file://***';
    }
  }
}