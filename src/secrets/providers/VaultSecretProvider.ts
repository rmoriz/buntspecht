import { BaseSecretProvider } from './BaseSecretProvider';

/**
 * HashiCorp Vault secret provider
 * 
 * Supported formats:
 * - vault://vault-server/secret/path
 * - vault://vault-server/secret/path?version=2
 * 
 * Examples:
 * - vault://vault.example.com/secret/myapp/db-password
 * - vault://localhost:8200/secret/data/api-keys?version=1
 */
export class VaultSecretProvider extends BaseSecretProvider {
  public readonly name = 'vault';
  private vaultClient: any;

  protected async initializeProvider(): Promise<void> {
    // Try to load node-vault dependency
    let nodeVault: any;
    try {
      nodeVault = require('node-vault');
    } catch (error) {
      throw new Error('node-vault package is required for Vault secret provider. Install with: npm install node-vault');
    }

    this.validateDependencies({ nodeVault });

    // Initialize vault client with configuration
    const vaultConfig = {
      endpoint: this.config.endpoint || 'http://localhost:8200',
      token: this.config.token || process.env.VAULT_TOKEN,
      ...(this.config.vaultOptions || {})
    };

    if (!vaultConfig.token) {
      throw new Error('Vault token is required. Set VAULT_TOKEN environment variable or provide token in configuration.');
    }

    this.vaultClient = nodeVault(vaultConfig);
    this.logger?.debug(`Vault client initialized with endpoint: ${vaultConfig.endpoint}`);
  }

  public canHandle(source: string): boolean {
    return source.startsWith('vault://');
  }

  protected async resolveSecret(source: string): Promise<string> {
    const { server, secretPath, version } = this.parseVaultUrl(source);
    
    try {
      this.logger?.debug(`Reading secret from Vault: ${secretPath}${version ? ` (version: ${version})` : ''}`);
      
      let response: any;
      
      if (version) {
        // Read specific version
        response = await this.withTimeout(
          this.vaultClient.read(`${secretPath}`, { version })
        );
      } else {
        // Read latest version
        response = await this.withTimeout(
          this.vaultClient.read(secretPath)
        );
      }
      
      if (!response || !response.data) {
        throw new Error(`No data found at Vault path: ${secretPath}`);
      }
      
      // Handle KV v2 format (data.data) vs KV v1 format (data)
      const secretData = response.data.data || response.data;
      
      if (!secretData) {
        throw new Error(`No secret data found at Vault path: ${secretPath}`);
      }
      
      // If secretData is a string, return it directly
      if (typeof secretData === 'string') {
        return secretData;
      }
      
      // If secretData is an object, look for common secret field names
      const commonFields = ['value', 'secret', 'password', 'token', 'key'];
      for (const field of commonFields) {
        if (secretData[field]) {
          return String(secretData[field]);
        }
      }
      
      // If no common field found, return the first string value
      for (const [key, value] of Object.entries(secretData)) {
        if (typeof value === 'string') {
          this.logger?.debug(`Using field '${key}' from Vault secret`);
          return value;
        }
      }
      
      throw new Error(`No string value found in Vault secret at path: ${secretPath}`);
      
    } catch (error) {
      if (error instanceof Error) {
        // Handle common Vault errors
        if (error.message.includes('permission denied')) {
          throw new Error(`Permission denied accessing Vault path: ${secretPath}`);
        }
        if (error.message.includes('not found')) {
          throw new Error(`Secret not found at Vault path: ${secretPath}`);
        }
      }
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      // Test connection by checking Vault status
      await this.withTimeout(this.vaultClient.status(), 5000);
      return true;
    } catch (error) {
      this.logger?.warn(`Vault connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  protected async cleanupProvider(): Promise<void> {
    // No specific cleanup needed for Vault client
    this.vaultClient = null;
  }

  /**
   * Parse Vault URL to extract server, path, and version
   */
  private parseVaultUrl(source: string): { server: string; secretPath: string; version?: string } {
    if (!source.startsWith('vault://')) {
      throw new Error(`Invalid Vault source format: ${source}`);
    }
    
    const url = new URL(source);
    const server = `${url.protocol}//${url.host}`;
    const secretPath = url.pathname.substring(1); // Remove leading slash
    
    let version: string | undefined;
    if (url.searchParams.has('version')) {
      version = url.searchParams.get('version') || undefined;
    }
    
    if (!secretPath) {
      throw new Error(`Invalid Vault path in source: ${source}`);
    }
    
    return {
      server,
      secretPath,
      version
    };
  }

  protected maskSource(source: string): string {
    try {
      const { server, secretPath } = this.parseVaultUrl(source);
      const pathParts = secretPath.split('/');
      
      // Mask the last part of the path (usually the secret name)
      if (pathParts.length > 0) {
        pathParts[pathParts.length - 1] = '***';
      }
      
      return `vault://${new URL(server).host}/${pathParts.join('/')}`;
    } catch {
      return 'vault://***';
    }
  }
}