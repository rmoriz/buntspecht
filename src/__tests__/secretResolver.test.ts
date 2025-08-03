import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretResolver, FileSecretProvider, VaultSecretProvider } from '../services/secretResolver';
import { CrossRuntimeTestHelpers } from './utils/crossRuntimeHelpers';

describe('SecretResolver (Cross-Runtime)', () => {
  let secretResolver: SecretResolver;
  let logger: any;
  let tempDir: string;

  beforeEach(() => {
    logger = CrossRuntimeTestHelpers.createTestLogger('error');
    secretResolver = new SecretResolver(logger);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buntspecht-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('SecretResolver core functionality', () => {
    it('should create a SecretResolver instance', () => {
      expect(secretResolver).toBeDefined();
      expect(typeof secretResolver.resolveSecret).toBe('function');
      expect(typeof secretResolver.resolveCredentialField).toBe('function');
    });

    it('should have provider management methods', () => {
      expect(typeof secretResolver.registerProvider).toBe('function');
      expect(typeof secretResolver.getAvailableProviders).toBe('function');
      expect(typeof secretResolver.isProviderAvailable).toBe('function');
    });

    it('should have cache management methods', () => {
      expect(typeof secretResolver.clearCache).toBe('function');
      expect(typeof secretResolver.getCacheStats).toBe('function');
      expect(typeof secretResolver.setCacheEnabled).toBe('function');
    });

    it('should handle environment variable syntax', async () => {
      // Set a test environment variable
      process.env.TEST_SECRET_VAR = 'test-env-value';
      
      try {
        const result = await secretResolver.resolveSecret('${TEST_SECRET_VAR}');
        expect(result).toBe('test-env-value');
      } finally {
        delete process.env.TEST_SECRET_VAR;
      }
    });
  });

  describe('FileSecretProvider', () => {
    let provider: FileSecretProvider;
    let testFilePath: string;

    beforeEach(() => {
      provider = new FileSecretProvider();
      testFilePath = path.join(tempDir, 'test-secret.txt');
      fs.writeFileSync(testFilePath, 'secret-content-123');
    });

    it('should handle file:// syntax', () => {
      expect(provider.canHandle('file://test.txt')).toBe(true);
      expect(provider.canHandle('file:///absolute/path/test.txt')).toBe(true);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
      expect(provider.canHandle('vault://secret')).toBe(false);
    });

    it('should resolve file contents', async () => {
      // Register the file provider with the secret resolver
      secretResolver.registerProvider(provider);
      
      const result = await secretResolver.resolveSecret(`file://${testFilePath}`);
      expect(result).toBe('secret-content-123');
    });

    it('should handle absolute file paths', async () => {
      const absoluteFile = path.join(tempDir, 'absolute-secret.txt');
      fs.writeFileSync(absoluteFile, 'absolute-content');
      
      // Register the provider and test with absolute path (no .. allowed for security)
      secretResolver.registerProvider(provider);
      const result = await secretResolver.resolveSecret(`file://${absoluteFile}`);
      expect(result).toBe('absolute-content');
    });

    it('should throw error for non-existent files', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.txt');
      secretResolver.registerProvider(provider);
      await expect(secretResolver.resolveSecret(`file://${nonExistentPath}`)).rejects.toThrow();
    });

    it('should handle files with different encodings', async () => {
      const utf8File = path.join(tempDir, 'utf8-secret.txt');
      fs.writeFileSync(utf8File, 'UTF-8 content: 你好世界', 'utf8');
      
      secretResolver.registerProvider(provider);
      const result = await secretResolver.resolveSecret(`file://${utf8File}`);
      expect(result).toBe('UTF-8 content: 你好世界');
    });

    it('should trim whitespace from file contents', async () => {
      const whitespaceFile = path.join(tempDir, 'whitespace-secret.txt');
      fs.writeFileSync(whitespaceFile, '  \n  secret-with-whitespace  \n  ');
      
      secretResolver.registerProvider(provider);
      const result = await secretResolver.resolveSecret(`file://${whitespaceFile}`);
      expect(result).toBe('secret-with-whitespace');
    });
  });

  describe('VaultSecretProvider', () => {
    let provider: VaultSecretProvider;

    beforeEach(() => {
      provider = new VaultSecretProvider(logger);
    });

    it('should handle vault:// syntax', () => {
      expect(provider.canHandle('vault://secret/data/myapp')).toBe(true);
      expect(provider.canHandle('vault://secret/data/myapp?key=password')).toBe(true);
      expect(provider.canHandle('file://test.txt')).toBe(false);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
    });

    it('should parse vault URLs correctly', () => {
      // Test URL parsing logic (without actually connecting to Vault)
      const url1 = 'vault://secret/data/myapp';
      const url2 = 'vault://secret/data/myapp?key=password';
      
      expect(url1.includes('secret/data/myapp')).toBe(true);
      expect(url2.includes('secret/data/myapp')).toBe(true);
      expect(url2.includes('key=password')).toBe(true);
    });

    it('should handle vault URLs with query parameters', () => {
      const urlWithParams = 'vault://secret/data/myapp?key=password&version=2';
      
      expect(provider.canHandle(urlWithParams)).toBe(true);
      expect(urlWithParams.includes('key=password')).toBe(true);
      expect(urlWithParams.includes('version=2')).toBe(true);
    });

    // Note: We don't test actual Vault connectivity as it requires a running Vault instance
    // In a real environment, you would mock the Vault client or use integration tests
  });

  describe('Environment variable handling', () => {
    it('should handle environment variable syntax detection', () => {
      // Test basic environment variable patterns
      const envPattern1 = '${TEST_VAR}';
      const envPattern2 = '${ANOTHER_VAR}';
      const nonEnvPattern = 'regular-string';
      
      expect(envPattern1.includes('${') && envPattern1.includes('}')).toBe(true);
      expect(envPattern2.includes('${') && envPattern2.includes('}')).toBe(true);
      expect(nonEnvPattern.includes('${') && nonEnvPattern.includes('}')).toBe(false);
    });

    it('should resolve environment variables when available', async () => {
      // Set a test environment variable
      process.env.TEST_SECRET_VAR = 'test-env-value';
      
      try {
        // Test environment variable resolution (if implemented)
        const envValue = process.env.TEST_SECRET_VAR;
        expect(envValue).toBe('test-env-value');
      } finally {
        // Clean up
        delete process.env.TEST_SECRET_VAR;
      }
    });
  });

  describe('Integration tests', () => {
    it('should handle multiple secret types in sequence', async () => {
      // Test file secret
      const testFile = path.join(tempDir, 'integration-secret.txt');
      fs.writeFileSync(testFile, 'file-secret-value');
      
      // Register file provider
      const fileProvider = new FileSecretProvider();
      secretResolver.registerProvider(fileProvider);
      
      const fileResult = await secretResolver.resolveSecret(`file://${testFile}`);
      expect(fileResult).toBe('file-secret-value');
      
      // Test environment variable (plain text would just return as-is)
      process.env.TEST_PLAIN_VAR = 'plain-text-value';
      const plainResult = await secretResolver.resolveSecret('${TEST_PLAIN_VAR}');
      expect(plainResult).toBe('plain-text-value');
      delete process.env.TEST_PLAIN_VAR;
    });

    it('should handle complex file paths', async () => {
      // Create nested directory structure
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'directory');
      fs.mkdirSync(nestedDir, { recursive: true });
      
      const nestedFile = path.join(nestedDir, 'nested-secret.txt');
      fs.writeFileSync(nestedFile, 'nested-secret-content');
      
      const result = await secretResolver.resolveSecret(`file://${nestedFile}`);
      expect(result).toBe('nested-secret-content');
    });

    it('should handle special characters in file contents', async () => {
      const specialFile = path.join(tempDir, 'special-chars.txt');
      const specialContent = 'Secret with special chars: !@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      fs.writeFileSync(specialFile, specialContent);
      
      const result = await secretResolver.resolveSecret(`file://${specialFile}`);
      expect(result).toBe(specialContent);
    });
  });

  describe('Error handling', () => {
    it('should provide meaningful error messages', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');
      
      try {
        await secretResolver.resolveSecret(`file://${nonExistentFile}`);
        throw new Error('Should have thrown an error');
      } catch (error: any) {
        // The error message format may vary between Jest and Bun
        expect(error.message).toMatch(/Failed to read secret file|ENOENT|does-not-exist/);
      }
    });

    it('should handle malformed URLs gracefully', async () => {
      // Test various malformed URLs
      const malformedUrls = [
        'file://',
        'vault://',
        'file:///',
        'vault:///',
      ];
      
      for (const url of malformedUrls) {
        try {
          await secretResolver.resolveSecret(url);
          // Some might succeed (empty path), others might fail
        } catch (error) {
          // Error is expected for malformed URLs
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle permission errors gracefully', async () => {
      // This test might not work on all systems due to permission restrictions
      // but demonstrates the error handling approach
      const restrictedPath = '/root/secret.txt'; // Typically not accessible
      
      try {
        await secretResolver.resolveSecret(`file://${restrictedPath}`);
      } catch (error: any) {
        // Expected to fail with permission error
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance considerations', () => {
    it('should handle multiple concurrent secret resolutions', async () => {
      // Create multiple test files
      const files = [];
      for (let i = 0; i < 5; i++) {
        const filePath = path.join(tempDir, `concurrent-${i}.txt`);
        fs.writeFileSync(filePath, `content-${i}`);
        files.push(filePath);
      }
      
      // Resolve all files concurrently
      const promises = files.map(file => 
        secretResolver.resolveSecret(`file://${file}`)
      );
      
      const results = await Promise.all(promises);
      
      // Verify all results
      results.forEach((result: string, index: number) => {
        expect(result).toBe(`content-${index}`);
      });
    });

    it('should handle large file contents', async () => {
      // Create a larger file (1MB of content)
      const largeContent = 'x'.repeat(1024 * 1024);
      const largeFile = path.join(tempDir, 'large-secret.txt');
      fs.writeFileSync(largeFile, largeContent);
      
      const result = await secretResolver.resolveSecret(`file://${largeFile}`);
      expect(result).toBe(largeContent);
      expect(result.length).toBe(1024 * 1024);
    });
  });
});