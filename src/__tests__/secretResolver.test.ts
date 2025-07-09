import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecretResolver, EnvironmentSecretProvider, FileSecretProvider, VaultSecretProvider, AWSSecretsProvider, AzureKeyVaultProvider, GCPSecretManagerProvider } from '../services/secretResolver';
import { Logger } from '../utils/logger';

describe('SecretResolver', () => {
  let secretResolver: SecretResolver;
  let logger: Logger;
  let tempDir: string;

  beforeEach(() => {
    logger = new Logger('error'); // Use error level to suppress logs during tests
    secretResolver = new SecretResolver(logger);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buntspecht-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('EnvironmentSecretProvider', () => {
    let provider: EnvironmentSecretProvider;

    beforeEach(() => {
      provider = new EnvironmentSecretProvider();
    });

    it('should handle environment variable syntax', () => {
      expect(provider.canHandle('${TEST_VAR}')).toBe(true);
      expect(provider.canHandle('${ANOTHER_VAR}')).toBe(true);
      expect(provider.canHandle('not-env-var')).toBe(false);
      expect(provider.canHandle('file://test')).toBe(false);
    });

    it('should resolve environment variables', async () => {
      process.env.TEST_SECRET = 'secret-value-123';
      
      const result = await provider.resolve('${TEST_SECRET}');
      expect(result).toBe('secret-value-123');
      
      delete process.env.TEST_SECRET;
    });

    it('should throw error for undefined environment variables', async () => {
      await expect(provider.resolve('${UNDEFINED_VAR}')).rejects.toThrow(
        'Environment variable UNDEFINED_VAR is not set'
      );
    });
  });

  describe('FileSecretProvider', () => {
    let provider: FileSecretProvider;

    beforeEach(() => {
      provider = new FileSecretProvider();
    });

    it('should handle file:// syntax', () => {
      expect(provider.canHandle('file:///path/to/secret')).toBe(true);
      expect(provider.canHandle('file://relative/path')).toBe(true);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
      expect(provider.canHandle('vault://secret')).toBe(false);
    });

    it('should resolve file-based secrets', async () => {
      const secretFile = path.join(tempDir, 'secret.txt');
      fs.writeFileSync(secretFile, 'file-secret-value\n');
      
      const result = await provider.resolve(`file://${secretFile}`);
      expect(result).toBe('file-secret-value'); // Should trim newlines
    });

    it('should handle files without trailing newlines', async () => {
      const secretFile = path.join(tempDir, 'secret-no-newline.txt');
      fs.writeFileSync(secretFile, 'no-newline-secret');
      
      const result = await provider.resolve(`file://${secretFile}`);
      expect(result).toBe('no-newline-secret');
    });

    it('should throw error for non-existent files', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');
      
      await expect(provider.resolve(`file://${nonExistentFile}`)).rejects.toThrow(
        /Failed to read secret file.*does-not-exist\.txt/
      );
    });
  });

  describe('VaultSecretProvider', () => {
    let provider: VaultSecretProvider;

    beforeEach(() => {
      try {
        provider = new VaultSecretProvider(logger);
      } catch (error) {
        // Skip tests if node-vault is not installed
        provider = null as unknown as VaultSecretProvider;
      }
    });

    it('should handle vault:// syntax', () => {
      if (!provider) {
        console.log('Skipping Vault tests - node-vault not installed');
        return;
      }
      
      expect(provider.canHandle('vault://secret/myapp/token')).toBe(true);
      expect(provider.canHandle('vault://secret/path?key=password')).toBe(true);
      expect(provider.canHandle('file://test')).toBe(false);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
    });

    it('should parse vault URLs correctly', () => {
      if (!provider) {
        console.log('Skipping Vault tests - node-vault not installed');
        return;
      }

      // Test private method through reflection for testing purposes
      const parseMethod = (provider as unknown as { parseVaultUrl: (url: string) => { secretPath: string; key?: string } }).parseVaultUrl;
      
      expect(parseMethod('vault://secret/myapp/token')).toEqual({
        secretPath: 'secret/myapp/token',
        key: undefined
      });
      
      expect(parseMethod('vault://secret/myapp/creds?key=password')).toEqual({
        secretPath: 'secret/myapp/creds',
        key: 'password'
      });
    });

    it('should require VAULT_TOKEN environment variable', async () => {
      if (!provider) {
        console.log('Skipping Vault tests - node-vault not installed');
        return;
      }

      // Ensure VAULT_TOKEN is not set
      const originalToken = process.env.VAULT_TOKEN;
      delete process.env.VAULT_TOKEN;
      
      await expect(provider.resolve('vault://secret/test')).rejects.toThrow(
        'VAULT_TOKEN environment variable is required for Vault authentication'
      );
      
      // Restore original token if it existed
      if (originalToken) {
        process.env.VAULT_TOKEN = originalToken;
      }
    });
  });

  describe('AWSSecretsProvider', () => {
    let provider: AWSSecretsProvider;

    beforeEach(() => {
      try {
        provider = new AWSSecretsProvider(logger);
      } catch (error) {
        // Skip tests if @aws-sdk/client-secrets-manager is not installed
        provider = null as unknown as AWSSecretsProvider;
      }
    });

    it('should handle aws:// syntax', () => {
      if (!provider) {
        console.log('Skipping AWS tests - @aws-sdk/client-secrets-manager not installed');
        return;
      }
      
      expect(provider.canHandle('aws://my-secret')).toBe(true);
      expect(provider.canHandle('aws://my-secret?key=password')).toBe(true);
      expect(provider.canHandle('aws://my-secret?key=password&region=us-west-2')).toBe(true);
      expect(provider.canHandle('vault://secret')).toBe(false);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
    });

    it('should parse AWS URLs correctly', () => {
      if (!provider) {
        console.log('Skipping AWS tests - @aws-sdk/client-secrets-manager not installed');
        return;
      }

      // Test private method through reflection for testing purposes
      const parseMethod = (provider as unknown as { parseAwsUrl: (url: string) => { secretName: string; key?: string; region: string } }).parseAwsUrl;
      
      expect(parseMethod('aws://my-secret')).toEqual({
        secretName: 'my-secret',
        key: undefined,
        region: expect.any(String) // Default region
      });
      
      expect(parseMethod('aws://my-secret?key=password&region=eu-west-1')).toEqual({
        secretName: 'my-secret',
        key: 'password',
        region: 'eu-west-1'
      });
    });

    it('should use default region from environment or fallback', () => {
      if (!provider) {
        console.log('Skipping AWS tests - @aws-sdk/client-secrets-manager not installed');
        return;
      }

      const originalRegion = process.env.AWS_DEFAULT_REGION;
      process.env.AWS_DEFAULT_REGION = 'us-west-2';
      
      const parseMethod = (provider as unknown as { parseAwsUrl: (url: string) => { secretName: string; key?: string; region: string } }).parseAwsUrl;
      const result = parseMethod('aws://my-secret');
      
      expect(result.region).toBe('us-west-2');
      
      // Restore original region
      if (originalRegion) {
        process.env.AWS_DEFAULT_REGION = originalRegion;
      } else {
        delete process.env.AWS_DEFAULT_REGION;
      }
    });
  });

  describe('AzureKeyVaultProvider', () => {
    let provider: AzureKeyVaultProvider;

    beforeEach(() => {
      try {
        provider = new AzureKeyVaultProvider(logger);
      } catch (error) {
        // Skip tests if Azure packages are not installed
        provider = null as unknown as AzureKeyVaultProvider;
      }
    });

    it('should handle azure:// syntax', () => {
      if (!provider) {
        console.log('Skipping Azure tests - @azure/keyvault-secrets and @azure/identity not installed');
        return;
      }
      
      expect(provider.canHandle('azure://my-vault/my-secret')).toBe(true);
      expect(provider.canHandle('azure://my-vault/my-secret?version=abc123')).toBe(true);
      expect(provider.canHandle('aws://secret')).toBe(false);
      expect(provider.canHandle('vault://secret')).toBe(false);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
    });

    it('should parse Azure URLs correctly', () => {
      if (!provider) {
        console.log('Skipping Azure tests - @azure/keyvault-secrets and @azure/identity not installed');
        return;
      }

      // Test private method through reflection for testing purposes
      const parseMethod = (provider as unknown as { parseAzureUrl: (url: string) => { vaultName: string; secretName: string; version?: string } }).parseAzureUrl;
      
      expect(parseMethod('azure://my-vault/my-secret')).toEqual({
        vaultName: 'my-vault',
        secretName: 'my-secret',
        version: undefined
      });
      
      expect(parseMethod('azure://my-vault/my-secret?version=abc123')).toEqual({
        vaultName: 'my-vault',
        secretName: 'my-secret',
        version: 'abc123'
      });
    });

    it('should validate Azure URL format', () => {
      if (!provider) {
        console.log('Skipping Azure tests - @azure/keyvault-secrets and @azure/identity not installed');
        return;
      }

      const parseMethod = (provider as unknown as { parseAzureUrl: (url: string) => { vaultName: string; secretName: string; version?: string } }).parseAzureUrl;
      
      expect(() => parseMethod('azure://invalid-format')).toThrow(
        'Invalid Azure Key Vault URL format. Expected: azure://vault-name/secret-name'
      );
      
      expect(() => parseMethod('azure://vault/secret/extra/path')).toThrow(
        'Invalid Azure Key Vault URL format. Expected: azure://vault-name/secret-name'
      );
    });
  });

  describe('GCPSecretManagerProvider', () => {
    let provider: GCPSecretManagerProvider;

    beforeEach(() => {
      try {
        provider = new GCPSecretManagerProvider(logger);
      } catch (error) {
        // Skip tests if Google Cloud package is not installed
        provider = null as unknown as GCPSecretManagerProvider;
      }
    });

    it('should handle gcp:// syntax', () => {
      if (!provider) {
        console.log('Skipping GCP tests - @google-cloud/secret-manager not installed');
        return;
      }
      
      expect(provider.canHandle('gcp://my-project/my-secret')).toBe(true);
      expect(provider.canHandle('gcp://my-project/my-secret?version=5')).toBe(true);
      expect(provider.canHandle('gcp://my-project/my-secret?version=latest')).toBe(true);
      expect(provider.canHandle('aws://secret')).toBe(false);
      expect(provider.canHandle('azure://vault/secret')).toBe(false);
      expect(provider.canHandle('${ENV_VAR}')).toBe(false);
    });

    it('should parse GCP URLs correctly', () => {
      if (!provider) {
        console.log('Skipping GCP tests - @google-cloud/secret-manager not installed');
        return;
      }

      // Test private method through reflection for testing purposes
      const parseMethod = (provider as unknown as { parseGcpUrl: (url: string) => { projectId: string; secretName: string; version?: string } }).parseGcpUrl;
      
      expect(parseMethod('gcp://my-project/my-secret')).toEqual({
        projectId: 'my-project',
        secretName: 'my-secret',
        version: undefined
      });
      
      expect(parseMethod('gcp://my-project/my-secret?version=5')).toEqual({
        projectId: 'my-project',
        secretName: 'my-secret',
        version: '5'
      });
      
      expect(parseMethod('gcp://my-project/my-secret?version=latest')).toEqual({
        projectId: 'my-project',
        secretName: 'my-secret',
        version: 'latest'
      });
    });

    it('should validate GCP URL format', () => {
      if (!provider) {
        console.log('Skipping GCP tests - @google-cloud/secret-manager not installed');
        return;
      }

      const parseMethod = (provider as unknown as { parseGcpUrl: (url: string) => { projectId: string; secretName: string; version?: string } }).parseGcpUrl;
      
      expect(() => parseMethod('gcp://invalid-format')).toThrow(
        'Invalid Google Cloud Secret Manager URL format. Expected: gcp://project-id/secret-name'
      );
      
      expect(() => parseMethod('gcp://project/secret/extra/path')).toThrow(
        'Invalid Google Cloud Secret Manager URL format. Expected: gcp://project-id/secret-name'
      );
    });
  });

  describe('SecretResolver integration', () => {
    it('should resolve environment variables through main resolver', async () => {
      process.env.INTEGRATION_TEST_SECRET = 'integration-value';
      
      const result = await secretResolver.resolveSecret('${INTEGRATION_TEST_SECRET}');
      expect(result).toBe('integration-value');
      
      delete process.env.INTEGRATION_TEST_SECRET;
    });

    it('should resolve file secrets through main resolver', async () => {
      const secretFile = path.join(tempDir, 'integration-secret.txt');
      fs.writeFileSync(secretFile, 'integration-file-value');
      
      const result = await secretResolver.resolveSecret(`file://${secretFile}`);
      expect(result).toBe('integration-file-value');
    });

    it('should throw error for unsupported secret sources', async () => {
      await expect(secretResolver.resolveSecret('unsupported://secret')).rejects.toThrow(
        'No secret provider found for source: unsupported://secret'
      );
    });

    it('should list available providers', () => {
      const providers = secretResolver.getAvailableProviders();
      expect(providers).toContain('environment');
      expect(providers).toContain('file');
      // Vault and AWS providers may or may not be available depending on dependencies
    });

    it('should handle vault provider gracefully when not available', async () => {
      // This test ensures the resolver doesn't crash when vault provider fails to initialize
      const providers = secretResolver.getAvailableProviders();
      
      if (!providers.includes('vault')) {
        await expect(secretResolver.resolveSecret('vault://secret/test')).rejects.toThrow(
          'No secret provider found for source: vault://secret/test'
        );
      }
    });

    it('should handle AWS provider gracefully when not available', async () => {
      // This test ensures the resolver doesn't crash when AWS provider fails to initialize
      const providers = secretResolver.getAvailableProviders();
      
      if (!providers.includes('aws')) {
        await expect(secretResolver.resolveSecret('aws://my-secret')).rejects.toThrow(
          'No secret provider found for source: aws://my-secret'
        );
      }
    });

    it('should handle Azure provider gracefully when not available', async () => {
      // This test ensures the resolver doesn't crash when Azure provider fails to initialize
      const providers = secretResolver.getAvailableProviders();
      
      if (!providers.includes('azure')) {
        await expect(secretResolver.resolveSecret('azure://my-vault/my-secret')).rejects.toThrow(
          'No secret provider found for source: azure://my-vault/my-secret'
        );
      }
    });

    it('should handle GCP provider gracefully when not available', async () => {
      // This test ensures the resolver doesn't crash when GCP provider fails to initialize
      const providers = secretResolver.getAvailableProviders();
      
      if (!providers.includes('gcp')) {
        await expect(secretResolver.resolveSecret('gcp://my-project/my-secret')).rejects.toThrow(
          'No secret provider found for source: gcp://my-project/my-secret'
        );
      }
    });
  });

  describe('resolveCredentialField', () => {
    beforeEach(() => {
      process.env.TEST_CRED = 'env-credential-value';
    });

    afterEach(() => {
      delete process.env.TEST_CRED;
    });

    it('should return direct value when provided', async () => {
      const result = await secretResolver.resolveCredentialField(
        'direct-value',
        undefined,
        'testField',
        'testAccount'
      );
      expect(result).toBe('direct-value');
    });

    it('should resolve environment variable in direct value', async () => {
      const result = await secretResolver.resolveCredentialField(
        '${TEST_CRED}',
        undefined,
        'testField',
        'testAccount'
      );
      expect(result).toBe('env-credential-value');
    });

    it('should resolve source value when provided', async () => {
      const secretFile = path.join(tempDir, 'cred-secret.txt');
      fs.writeFileSync(secretFile, 'source-credential-value');
      
      const result = await secretResolver.resolveCredentialField(
        undefined,
        `file://${secretFile}`,
        'testField',
        'testAccount'
      );
      expect(result).toBe('source-credential-value');
    });

    it('should return undefined when neither value nor source provided', async () => {
      const result = await secretResolver.resolveCredentialField(
        undefined,
        undefined,
        'testField',
        'testAccount'
      );
      expect(result).toBeUndefined();
    });

    it('should throw error when both direct value and source provided', async () => {
      await expect(secretResolver.resolveCredentialField(
        'direct-value',
        'file://some-file',
        'testField',
        'testAccount'
      )).rejects.toThrow(
        'Account "testAccount": Cannot specify both testField and testFieldSource'
      );
    });
  });
});