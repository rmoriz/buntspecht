import { BaseSecretProvider } from './BaseSecretProvider';

/**
 * AWS Secrets Manager provider
 * 
 * Supported formats:
 * - aws://secret-name
 * - aws://secret-name?region=us-east-1
 * - aws://arn:aws:secretsmanager:region:account:secret:name-suffix
 * 
 * Examples:
 * - aws://myapp/database/password
 * - aws://prod-api-keys?region=eu-west-1
 * - aws://arn:aws:secretsmanager:us-west-2:123456789012:secret:MySecret-a1b2c3
 */
export class AwsSecretProvider extends BaseSecretProvider {
  public readonly name = 'aws';
  private secretsManager: any;

  protected async initializeProvider(): Promise<void> {
    // Try to load AWS SDK
    let AWS: any;
    try {
      AWS = require('@aws-sdk/client-secrets-manager');
    } catch (error) {
      throw new Error('@aws-sdk/client-secrets-manager package is required for AWS secret provider. Install with: npm install @aws-sdk/client-secrets-manager');
    }

    this.validateDependencies({ AWS });

    // Initialize AWS Secrets Manager client
    const clientConfig: any = {
      region: this.config.region || process.env.AWS_REGION || 'us-east-1',
    };

    // Add credentials if provided
    if (this.config.accessKeyId && this.config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken
      };
    }

    // Add endpoint if provided (for LocalStack or custom endpoints)
    if (this.config.endpoint) {
      clientConfig.endpoint = this.config.endpoint;
    }

    this.secretsManager = new AWS.SecretsManagerClient(clientConfig);
    this.logger?.debug(`AWS Secrets Manager client initialized for region: ${clientConfig.region}`);
  }

  public canHandle(source: string): boolean {
    return source.startsWith('aws://');
  }

  protected async resolveSecret(source: string): Promise<string> {
    const { secretId, region } = this.parseAwsUrl(source);
    
    try {
      this.logger?.debug(`Reading secret from AWS Secrets Manager: ${secretId}${region ? ` (region: ${region})` : ''}`);
      
      // Import the command class
      const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      
      const command = new GetSecretValueCommand({
        SecretId: secretId,
        VersionStage: 'AWSCURRENT' // Get the current version
      });
      
      const response = await this.withTimeout(
        this.secretsManager.send(command)
      );
      
      if (!response) {
        throw new Error(`No response from AWS Secrets Manager for secret: ${secretId}`);
      }
      
      // AWS Secrets Manager can return either SecretString or SecretBinary
      if (response.SecretString) {
        // Try to parse as JSON first
        try {
          const secretData = JSON.parse(response.SecretString);
          
          // If it's a JSON object, look for common secret field names
          if (typeof secretData === 'object' && secretData !== null) {
            const commonFields = ['value', 'secret', 'password', 'token', 'key'];
            for (const field of commonFields) {
              if (secretData[field]) {
                return String(secretData[field]);
              }
            }
            
            // If no common field found, return the first string value
            for (const [key, value] of Object.entries(secretData)) {
              if (typeof value === 'string') {
                this.logger?.debug(`Using field '${key}' from AWS secret`);
                return value;
              }
            }
            
            throw new Error(`No string value found in AWS secret JSON: ${secretId}`);
          }
        } catch (parseError) {
          // Not JSON, return the string directly
          return response.SecretString;
        }
        
        return response.SecretString;
      }
      
      if (response.SecretBinary) {
        // Convert binary to string
        const buffer = Buffer.from(response.SecretBinary);
        return buffer.toString('utf-8');
      }
      
      throw new Error(`No secret value found in AWS Secrets Manager for: ${secretId}`);
      
    } catch (error) {
      if (error instanceof Error) {
        // Handle common AWS errors
        if (error.name === 'ResourceNotFoundException') {
          throw new Error(`Secret not found in AWS Secrets Manager: ${secretId}`);
        }
        if (error.name === 'AccessDeniedException') {
          throw new Error(`Access denied to AWS secret: ${secretId}`);
        }
        if (error.name === 'InvalidParameterException') {
          throw new Error(`Invalid parameter for AWS secret: ${secretId}`);
        }
        if (error.name === 'InvalidRequestException') {
          throw new Error(`Invalid request for AWS secret: ${secretId}`);
        }
      }
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      // Test connection by listing secrets (with limit 1 to minimize impact)
      const { ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');
      
      const command = new ListSecretsCommand({
        MaxResults: 1
      });
      
      await this.withTimeout(this.secretsManager.send(command), 5000);
      return true;
    } catch (error) {
      this.logger?.warn(`AWS Secrets Manager connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  protected async cleanupProvider(): Promise<void> {
    // AWS SDK clients don't need explicit cleanup
    this.secretsManager = null;
  }

  /**
   * Parse AWS URL to extract secret ID and region
   */
  private parseAwsUrl(source: string): { secretId: string; region?: string } {
    if (!source.startsWith('aws://')) {
      throw new Error(`Invalid AWS source format: ${source}`);
    }
    
    const url = new URL(source);
    let secretId = url.pathname.substring(1); // Remove leading slash
    
    // Handle ARN format
    if (secretId.startsWith('arn:aws:secretsmanager:')) {
      // ARN format: arn:aws:secretsmanager:region:account:secret:name-suffix
      return { secretId };
    }
    
    // Handle simple name format
    if (!secretId) {
      throw new Error(`Invalid AWS secret ID in source: ${source}`);
    }
    
    let region: string | undefined;
    if (url.searchParams.has('region')) {
      region = url.searchParams.get('region') || undefined;
    }
    
    return {
      secretId,
      region
    };
  }

  protected maskSource(source: string): string {
    try {
      const { secretId } = this.parseAwsUrl(source);
      
      // Handle ARN format
      if (secretId.startsWith('arn:aws:secretsmanager:')) {
        const parts = secretId.split(':');
        if (parts.length >= 6) {
          // Mask the secret name part
          parts[6] = '***';
          return `aws://${parts.join(':')}`;
        }
      }
      
      // Handle simple name format
      const pathParts = secretId.split('/');
      if (pathParts.length > 0) {
        pathParts[pathParts.length - 1] = '***';
      }
      
      return `aws://${pathParts.join('/')}`;
    } catch {
      return 'aws://***';
    }
  }
}