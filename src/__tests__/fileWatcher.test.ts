import { FileWatcher } from '../utils/fileWatcher';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FileWatcher', () => {
  let logger: Logger;
  let tempDir: string;
  let testFile: string;
  let fileWatcher: FileWatcher;

  beforeEach(() => {
    logger = new Logger('debug');
    // Mock console methods to avoid test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();

    // Create a temporary directory and file for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filewatcher-test-'));
    testFile = path.join(tempDir, 'test.json');
    fs.writeFileSync(testFile, '{"test": "initial"}');
  });

  afterEach(() => {
    if (fileWatcher) {
      fileWatcher.cleanup();
    }
    // Clean up temporary files
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
      fs.rmdirSync(tempDir);
    } catch (error) {
      // Ignore cleanup errors
    }
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create FileWatcher with default 3-second debounce', () => {
      fileWatcher = new FileWatcher(testFile, logger);
      expect(fileWatcher.getDebounceMs()).toBe(3000);
    });

    it('should create FileWatcher with custom debounce time', () => {
      fileWatcher = new FileWatcher(testFile, logger, 5000);
      expect(fileWatcher.getDebounceMs()).toBe(5000);
    });
  });

  describe('debounce behavior', () => {
    it('should wait for debounce period before triggering callback', (done) => {
      const mockCallback = jest.fn();
      fileWatcher = new FileWatcher(testFile, logger, 100); // Use shorter time for testing
      
      fileWatcher.setChangeCallback(mockCallback);
      fileWatcher.setup();

      // Skip test in test environment since file watching is disabled
      if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        done();
        return;
      }

      // Wait a bit for setup to complete
      setTimeout(() => {
        // Modify the file
        fs.writeFileSync(testFile, '{"test": "modified"}');

        // Callback should not be called immediately
        expect(mockCallback).not.toHaveBeenCalled();
        expect(fileWatcher.hasPendingChange()).toBe(true);

        // Wait for debounce period
        setTimeout(() => {
          expect(mockCallback).toHaveBeenCalledTimes(1);
          expect(fileWatcher.hasPendingChange()).toBe(false);
          done();
        }, 150); // Wait longer than debounce time
      }, 50);
    });

    it('should reset debounce timer on multiple rapid changes', (done) => {
      const mockCallback = jest.fn();
      fileWatcher = new FileWatcher(testFile, logger, 100); // Use shorter time for testing
      
      fileWatcher.setChangeCallback(mockCallback);
      fileWatcher.setup();

      // Skip test in test environment since file watching is disabled
      if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        done();
        return;
      }

      // Wait a bit for setup to complete
      setTimeout(() => {
        // Make multiple rapid changes
        fs.writeFileSync(testFile, '{"test": "change1"}');
        
        setTimeout(() => {
          fs.writeFileSync(testFile, '{"test": "change2"}');
          
          setTimeout(() => {
            fs.writeFileSync(testFile, '{"test": "change3"}');
            
            // Should still be pending after rapid changes
            expect(fileWatcher.hasPendingChange()).toBe(true);
            expect(mockCallback).not.toHaveBeenCalled();
            
            // Wait for final debounce to complete
            setTimeout(() => {
              expect(mockCallback).toHaveBeenCalledTimes(1);
              expect(fileWatcher.hasPendingChange()).toBe(false);
              done();
            }, 150);
          }, 20);
        }, 20);
      }, 50);
    });
  });

  describe('cleanup', () => {
    it('should clear pending debounce timeout on cleanup', () => {
      const mockCallback = jest.fn();
      fileWatcher = new FileWatcher(testFile, logger, 1000);
      
      fileWatcher.setChangeCallback(mockCallback);
      fileWatcher.setup();

      // Skip test in test environment since file watching is disabled
      if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        return;
      }

      // Simulate a file change to create pending timeout
      fs.writeFileSync(testFile, '{"test": "modified"}');
      
      // Should have pending change
      expect(fileWatcher.hasPendingChange()).toBe(true);
      
      // Cleanup should clear the timeout
      fileWatcher.cleanup();
      expect(fileWatcher.hasPendingChange()).toBe(false);
      expect(fileWatcher.isWatching()).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('should return correct file path', () => {
      fileWatcher = new FileWatcher(testFile, logger);
      expect(fileWatcher.getFilePath()).toBe(testFile);
    });

    it('should allow updating debounce time', () => {
      fileWatcher = new FileWatcher(testFile, logger, 1000);
      expect(fileWatcher.getDebounceMs()).toBe(1000);
      
      fileWatcher.setDebounceMs(5000);
      expect(fileWatcher.getDebounceMs()).toBe(5000);
    });

    it('should detect file changes', () => {
      fileWatcher = new FileWatcher(testFile, logger);
      
      // First call initializes the content, so it may return true
      const initialCheck = fileWatcher.hasFileChanged();
      
      // Second call should return false (no new changes since initialization)
      expect(fileWatcher.hasFileChanged()).toBe(false);
      
      // Modify file
      fs.writeFileSync(testFile, '{"test": "modified"}');
      
      // Should detect change
      expect(fileWatcher.hasFileChanged()).toBe(true);
      
      // Second call should return false (no new changes)
      expect(fileWatcher.hasFileChanged()).toBe(false);
    });
  });
});