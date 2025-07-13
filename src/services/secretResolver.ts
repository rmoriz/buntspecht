import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

// Optional dependencies - only imported if available
let nodeVault: typeof import('node-vault') | undefined;
let SecretsManagerClient: typeof import('@aws-sdk/client-secrets-manager').SecretsManagerClient | undefined;
let GetSecretValueCommand: typeof import('@aws-sdk/client-secrets-manager').GetSecretValueCommand | undefined;
let SecretClient: typeof import('@azure/keyvault-secrets').SecretClient | undefined;
let DefaultAzureCredential: typeof import('@azure/identity').DefaultAzureCredential | undefined;
let SecretManagerServiceClient: typeof import('@google-cloud/secret-manager').SecretManagerServiceClient | undefined;

try {
  nodeVault = require('node-vault');
} catch {
  // node-vault not installed
}

try {
  const awsSdk = require('@aws-sdk/client-secrets-manager');
  SecretsManagerClient = awsSdk.SecretsManagerClient;
  GetSecretValueCommand = awsSdk.GetSecretValueCommand;
} catch {
  // @aws-sdk/client-secrets-manager not installed
}

try {
  const azureKeyVault = require('@azure/keyvault-secrets');
  const azureIdentity = require('@azure/identity');
  SecretClient = azureKeyVault.SecretClient;
  DefaultAzureCredential = azureIdentity.DefaultAzureCredential;
} catch {
  // @azure/keyvault-secrets or @azure/identity not installed
}

try {
  const gcpSecretManager = require('@google-cloud/secret-manager');
  SecretManagerServiceClient = gcpSecretManager.SecretManagerServiceClient;
} catch {
  // @google-cloud/secret-manager not installed
}

/**
 * Interface for secret providers that can resolve external secret sources
 */
export interface SecretProvider {
  name: string;
  canHandle(source: string): boolean;
  resolve(source: string): Promise<string>;
}

/**
 * Environment variable secret provider
 * Handles ${VAR_NAME} syntax
 */
export class EnvironmentSecretProvider implements SecretProvider {
  name = 'environment';

  canHandle(source: string): boolean {
    return source.startsWith('${') && source.endsWith('}');
  }

  async resolve(source: string): Promise<string> {
    const varName = source.slice(2, -1); // Remove ${ and }
    const value = process.env[varName];
    
    if (value === undefined) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    
    return value;
  }
}

/**
 * File-based secret provider
 * Handles file:// syntax
 */
export class FileSecretProvider implements SecretProvider {
  name = 'file';

  canHandle(source: string): boolean {
    return source.startsWith('file://');
  }

  async resolve(source: string): Promise<string> {
    const filePath = source.replace('file://', '');
    const resolvedPath = path.resolve(filePath);
    
    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return content.trim(); // Remove trailing newlines
    } catch (error) {
      throw new Error(`Failed to read secret file ${resolvedPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * HashiCorp Vault secret provider
 * Handles vault:// syntax
 * Format: vault://path/to/secret[?key=fieldName]
 * Examples:
 *   vault://secret/myapp/db-password
 *   vault://secret/myapp/credentials?key=password
 */
export class VaultSecretProvider implements SecretProvider {
  name = 'vault';
  private vault: ReturnType<typeof import('node-vault')> | undefined;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    if (!nodeVault) {
      throw new Error('node-vault package is required for Vault secret provider. Install with: npm install node-vault');
    }
  }

  canHandle(source: string): boolean {
    return source.startsWith('vault://');
  }

  async resolve(source: string): Promise<string> {
    try {
      // Initialize Vault client if not already done
      if (!this.vault) {
        await this.initializeVault();
      }

      // Parse the vault:// URL
      const { secretPath, key } = this.parseVaultUrl(source);
      
      this.logger.debug(`Reading secret from Vault path: ${secretPath}${key ? ` (key: ${key})` : ''}`);
      
      // Read secret from Vault
      if (!this.vault) {
        throw new Error('Vault client not initialized');
      }
      const response = await this.vault.read(secretPath);
      
      if (!response || !response.data) {
        throw new Error(`No data found at Vault path: ${secretPath}`);
      }

      // Extract the specific key or return the whole secret
      if (key) {
        if (!(key in response.data)) {
          throw new Error(`Key "${key}" not found in Vault secret at path: ${secretPath}`);
        }
        return response.data[key];
      } else {
        // If no key specified, try common field names
        const commonKeys = ['value', 'password', 'token', 'secret'];
        for (const commonKey of commonKeys) {
          if (commonKey in response.data) {
            return response.data[commonKey];
          }
        }
        
        // If no common keys found, return the first value
        const keys = Object.keys(response.data);
        if (keys.length === 1) {
          return response.data[keys[0]];
        }
        
        throw new Error(`Multiple keys found in Vault secret at ${secretPath}. Please specify which key to use with ?key=fieldName`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read secret from Vault: ${errorMessage}`);
    }
  }

  private async initializeVault(): Promise<void> {
    const vaultAddr = process.env.VAULT_ADDR || 'http://localhost:8200';
    const vaultToken = process.env.VAULT_TOKEN;
    
    if (!vaultToken) {
      throw new Error('VAULT_TOKEN environment variable is required for Vault authentication');
    }

    if (!nodeVault) {
      throw new Error('node-vault module not available');
    }
    
    this.vault = nodeVault({
      apiVersion: 'v1',
      endpoint: vaultAddr,
      token: vaultToken,
    });

    // Test the connection
    try {
      await this.vault.read('sys/health');
      this.logger.debug(`Connected to Vault at ${vaultAddr}`);
    } catch (error) {
      throw new Error(`Failed to connect to Vault at ${vaultAddr}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseVaultUrl(source: string): { secretPath: string; key?: string } {
    // Remove vault:// prefix
    const urlPart = source.replace('vault://', '');
    
    // Check for query parameters
    const [pathPart, queryPart] = urlPart.split('?');
    
    let key: string | undefined;
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      key = params.get('key') || undefined;
    }
    
    return {
      secretPath: pathPart,
      key
    };
  }
}

/**
 * AWS Secrets Manager provider
 * Handles aws:// syntax
 * Format: aws://secret-name[?key=fieldName&region=us-east-1]
 * Examples:
 *   aws://buntspecht/mastodon-token
 *   aws://buntspecht/credentials?key=password
 *   aws://buntspecht/db-creds?key=password&region=eu-west-1
 */
export class AWSSecretsProvider implements SecretProvider {
  name = 'aws';
  private secretsManagerClients: Map<string, InstanceType<typeof import('@aws-sdk/client-secrets-manager').SecretsManagerClient>> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    if (!SecretsManagerClient || !GetSecretValueCommand) {
      throw new Error('@aws-sdk/client-secrets-manager package is required for AWS Secrets Manager provider. Install with: npm install @aws-sdk/client-secrets-manager');
    }
  }

  canHandle(source: string): boolean {
    return source.startsWith('aws://');
  }

  async resolve(source: string): Promise<string> {
    try {
      // Parse the aws:// URL
      const { secretName, key, region } = this.parseAwsUrl(source);
      
      // Get or create AWS Secrets Manager client for this region
      let secretsManager = this.secretsManagerClients.get(region);
      if (!secretsManager) {
        secretsManager = this.createSecretsManagerClient(region);
        this.secretsManagerClients.set(region, secretsManager);
      }

      this.logger.debug(`Reading secret from AWS Secrets Manager: ${secretName}${key ? ` (key: ${key})` : ''} in region ${region}`);
      
      // Create and send the GetSecretValue command
      const command = new GetSecretValueCommand!({ SecretId: secretName });
      const response = await secretsManager.send(command);
      
      if (!response.SecretString) {
        throw new Error(`No secret string found for AWS secret: ${secretName}`);
      }

      // Parse the secret value
      let secretData: Record<string, unknown>;
      try {
        secretData = JSON.parse(response.SecretString);
      } catch {
        // If it's not JSON, treat it as a plain string
        if (key) {
          throw new Error(`Secret "${secretName}" is not JSON but key "${key}" was specified. Plain text secrets don't support key extraction.`);
        }
        return response.SecretString;
      }

      // Extract the specific key or return the whole secret
      if (key) {
        if (!(key in secretData)) {
          throw new Error(`Key "${key}" not found in AWS secret: ${secretName}`);
        }
        return secretData[key] as string;
      } else {
        // If no key specified, try common field names
        const commonKeys = ['value', 'password', 'token', 'secret'];
        for (const commonKey of commonKeys) {
          if (commonKey in secretData) {
            return secretData[commonKey] as string;
          }
        }
        
        // If no common keys found, return the first value
        const keys = Object.keys(secretData);
        if (keys.length === 1) {
          return secretData[keys[0]] as string;
        }
        
        throw new Error(`Multiple keys found in AWS secret ${secretName}. Please specify which key to use with ?key=fieldName`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read secret from AWS Secrets Manager: ${errorMessage}`);
    }
  }

  private createSecretsManagerClient(region: string): InstanceType<typeof import('@aws-sdk/client-secrets-manager').SecretsManagerClient> {
    const client = new SecretsManagerClient!({
      region: region,
      // AWS SDK v3 will automatically use credentials from:
      // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
      // 2. IAM roles (if running on EC2)
      // 3. AWS credentials file (~/.aws/credentials)
      // 4. AWS config file (~/.aws/config)
      // 5. SSO credentials
      // 6. Web identity token credentials
    });

    this.logger.debug(`Created AWS Secrets Manager client for region: ${region}`);
    return client;
  }

  private parseAwsUrl(source: string): { secretName: string; key?: string; region: string } {
    // Remove aws:// prefix
    const urlPart = source.replace('aws://', '');
    
    // Check for query parameters
    const [pathPart, queryPart] = urlPart.split('?');
    
    let key: string | undefined;
    let region = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';
    
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      key = params.get('key') || undefined;
      region = params.get('region') || region;
    }
    
    return {
      secretName: pathPart,
      key,
      region
    };
  }
}

/**
 * Azure Key Vault secret provider
 * Handles azure:// syntax
 * Format: azure://vault-name/secret-name[?version=version-id]
 * Examples:
 *   azure://my-keyvault/mastodon-token
 *   azure://my-keyvault/db-password?version=abc123
 */
export class AzureKeyVaultProvider implements SecretProvider {
  name = 'azure';
  private keyVaultClients: Map<string, InstanceType<typeof import('@azure/keyvault-secrets').SecretClient>> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    if (!SecretClient || !DefaultAzureCredential) {
      throw new Error('@azure/keyvault-secrets and @azure/identity packages are required for Azure Key Vault provider. Install with: npm install @azure/keyvault-secrets @azure/identity');
    }
  }

  canHandle(source: string): boolean {
    return source.startsWith('azure://');
  }

  async resolve(source: string): Promise<string> {
    try {
      // Parse the azure:// URL
      const { vaultName, secretName, version } = this.parseAzureUrl(source);
      
      // Get or create Azure Key Vault client for this vault
      let keyVaultClient = this.keyVaultClients.get(vaultName);
      if (!keyVaultClient) {
        keyVaultClient = this.createKeyVaultClient(vaultName);
        this.keyVaultClients.set(vaultName, keyVaultClient);
      }

      this.logger.debug(`Reading secret from Azure Key Vault: ${vaultName}/${secretName}${version ? ` (version: ${version})` : ''}`);
      
      // Get secret from Azure Key Vault
      const response = await keyVaultClient.getSecret(secretName, { version });
      
      if (!response.value) {
        throw new Error(`No secret value found for Azure Key Vault secret: ${vaultName}/${secretName}`);
      }

      return response.value;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read secret from Azure Key Vault: ${errorMessage}`);
    }
  }

  private createKeyVaultClient(vaultName: string): InstanceType<typeof import('@azure/keyvault-secrets').SecretClient> {
    const vaultUrl = `https://${vaultName}.vault.azure.net/`;
    
    // Create credential using DefaultAzureCredential which tries:
    // 1. Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
    // 2. Managed Identity (if running on Azure)
    // 3. Azure CLI credentials
    // 4. Azure PowerShell credentials
    // 5. Visual Studio Code credentials
    // 6. Interactive browser authentication
    const credential = new DefaultAzureCredential!();
    
    const client = new SecretClient!(vaultUrl, credential);

    this.logger.debug(`Created Azure Key Vault client for vault: ${vaultName}`);
    return client;
  }

  private parseAzureUrl(source: string): { vaultName: string; secretName: string; version?: string } {
    // Remove azure:// prefix
    const urlPart = source.replace('azure://', '');
    
    // Check for query parameters
    const [pathPart, queryPart] = urlPart.split('?');
    
    // Split path into vault name and secret name
    const pathSegments = pathPart.split('/');
    if (pathSegments.length !== 2) {
      throw new Error(`Invalid Azure Key Vault URL format. Expected: azure://vault-name/secret-name, got: ${source}`);
    }
    
    const [vaultName, secretName] = pathSegments;
    
    let version: string | undefined;
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      version = params.get('version') || undefined;
    }
    
    return {
      vaultName,
      secretName,
      version
    };
  }
}

/**
 * Google Cloud Secret Manager provider
 * Handles gcp:// syntax
 * Format: gcp://project-id/secret-name[?version=version-id]
 * Examples:
 *   gcp://my-project/mastodon-token
 *   gcp://my-project/db-password?version=5
 *   gcp://my-project/api-key?version=latest
 */
export class GCPSecretManagerProvider implements SecretProvider {
  name = 'gcp';
  private secretManagerClients: Map<string, InstanceType<typeof import('@google-cloud/secret-manager').SecretManagerServiceClient>> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    if (!SecretManagerServiceClient) {
      throw new Error('@google-cloud/secret-manager package is required for Google Cloud Secret Manager provider. Install with: npm install @google-cloud/secret-manager');
    }
  }

  canHandle(source: string): boolean {
    return source.startsWith('gcp://');
  }

  async resolve(source: string): Promise<string> {
    try {
      // Parse the gcp:// URL
      const { projectId, secretName, version } = this.parseGcpUrl(source);
      
      // Get or create Google Cloud Secret Manager client for this project
      let secretManagerClient = this.secretManagerClients.get(projectId);
      if (!secretManagerClient) {
        secretManagerClient = this.createSecretManagerClient();
        this.secretManagerClients.set(projectId, secretManagerClient);
      }

      this.logger.debug(`Reading secret from Google Cloud Secret Manager: ${projectId}/${secretName}${version ? ` (version: ${version})` : ''}`);
      
      // Construct the secret version name
      const secretVersionName = `projects/${projectId}/secrets/${secretName}/versions/${version || 'latest'}`;
      
      // Access the secret version
      const [response] = await secretManagerClient.accessSecretVersion({
        name: secretVersionName,
      });
      
      if (!response.payload || !response.payload.data) {
        throw new Error(`No secret data found for Google Cloud secret: ${projectId}/${secretName}`);
      }

      // Convert the secret data to string
      const secretValue = response.payload.data.toString();
      return secretValue;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read secret from Google Cloud Secret Manager: ${errorMessage}`);
    }
  }

  private createSecretManagerClient(): InstanceType<typeof import('@google-cloud/secret-manager').SecretManagerServiceClient> {
    // Create client using Application Default Credentials (ADC) which tries:
    // 1. GOOGLE_APPLICATION_CREDENTIALS environment variable (service account key file)
    // 2. gcloud user credentials (gcloud auth application-default login)
    // 3. Google Cloud metadata server (if running on GCP)
    // 4. Service account attached to the resource (Compute Engine, App Engine, etc.)
    const client = new SecretManagerServiceClient!();

    this.logger.debug('Created Google Cloud Secret Manager client');
    return client;
  }

  private parseGcpUrl(source: string): { projectId: string; secretName: string; version?: string } {
    // Remove gcp:// prefix
    const urlPart = source.replace('gcp://', '');
    
    // Check for query parameters
    const [pathPart, queryPart] = urlPart.split('?');
    
    // Split path into project ID and secret name
    const pathSegments = pathPart.split('/');
    if (pathSegments.length !== 2) {
      throw new Error(`Invalid Google Cloud Secret Manager URL format. Expected: gcp://project-id/secret-name, got: ${source}`);
    }
    
    const [projectId, secretName] = pathSegments;
    
    let version: string | undefined;
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      version = params.get('version') || undefined;
    }
    
    return {
      projectId,
      secretName,
      version
    };
  }
}

/**
 * Main secret resolver that coordinates multiple secret providers
 */
export class SecretResolver {
  private providers: SecretProvider[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    
    // Register built-in providers
    this.registerProvider(new EnvironmentSecretProvider());
    this.registerProvider(new FileSecretProvider());
    
    // Register external providers only if dependencies are available
    try {
      this.registerProvider(new VaultSecretProvider(logger));
    } catch {
      this.logger.debug('Vault provider not available: node-vault package not installed');
    }
    
    try {
      this.registerProvider(new AWSSecretsProvider(logger));
    } catch {
      this.logger.debug('AWS Secrets Manager provider not available: @aws-sdk/client-secrets-manager package not installed');
    }
    
    try {
      this.registerProvider(new AzureKeyVaultProvider(logger));
    } catch {
      this.logger.debug('Azure Key Vault provider not available: @azure/keyvault-secrets and @azure/identity packages not installed');
    }
    
    try {
      this.registerProvider(new GCPSecretManagerProvider(logger));
    } catch {
      this.logger.debug('Google Cloud Secret Manager provider not available: @google-cloud/secret-manager package not installed');
    }
  }

  /**
   * Register a new secret provider
   */
  registerProvider(provider: SecretProvider): void {
    this.providers.push(provider);
    this.logger.debug(`Registered secret provider: ${provider.name}`);
  }

  /**
   * Resolve a secret from an external source
   */
  async resolveSecret(source: string): Promise<string> {
    for (const provider of this.providers) {
      if (provider.canHandle(source)) {
        try {
          this.logger.debug(`Resolving secret using ${provider.name} provider`);
          const secret = await provider.resolve(source);
          this.logger.debug(`Successfully resolved secret using ${provider.name} provider`);
          return secret;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to resolve secret using ${provider.name} provider: ${errorMessage}`);
          throw error;
        }
      }
    }

    throw new Error(`No secret provider found for source: ${source}`);
  }

  /**
   * Resolve a credential field, supporting both direct values and external sources
   */
  async resolveCredentialField(
    directValue: string | undefined,
    sourceValue: string | undefined,
    fieldName: string,
    accountName: string
  ): Promise<string | undefined> {
    // Validate that both direct and source values are not provided
    if (directValue && sourceValue) {
      throw new Error(
        `Account "${accountName}": Cannot specify both ${fieldName} and ${fieldName}Source`
      );
    }

    // If direct value is provided, check if it's an environment variable reference
    if (directValue) {
      if (directValue.startsWith('${') && directValue.endsWith('}')) {
        return await this.resolveSecret(directValue);
      }
      return directValue;
    }

    // If source value is provided, resolve it
    if (sourceValue) {
      return await this.resolveSecret(sourceValue);
    }

    // Neither provided
    return undefined;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return this.providers.map(p => p.name);
  }
}