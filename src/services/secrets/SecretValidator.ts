import { Logger } from '../../utils/logger';

/**
 * Validates secret sources and resolved values
 */
export class SecretValidator {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate a secret source format
   */
  public validateSource(source: string): { valid: boolean; error?: string } {
    if (!source || typeof source !== 'string') {
      return { valid: false, error: 'Source must be a non-empty string' };
    }

    // Check for common patterns
    if (source.startsWith('${') && source.endsWith('}')) {
      return this.validateEnvironmentVariable(source);
    }

    if (source.startsWith('file://')) {
      return this.validateFileSource(source);
    }

    if (source.startsWith('vault://')) {
      return this.validateVaultSource(source);
    }

    if (source.startsWith('aws://')) {
      return this.validateAwsSource(source);
    }

    if (source.startsWith('azure://')) {
      return this.validateAzureSource(source);
    }

    if (source.startsWith('gcp://')) {
      return this.validateGcpSource(source);
    }

    return { valid: false, error: `Unsupported secret source format: ${source}` };
  }

  /**
   * Validate environment variable format
   */
  private validateEnvironmentVariable(source: string): { valid: boolean; error?: string } {
    const varName = source.slice(2, -1); // Remove ${ and }
    
    if (!varName) {
      return { valid: false, error: 'Environment variable name cannot be empty' };
    }

    // Check for valid environment variable name format
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(varName)) {
      return { valid: false, error: `Invalid environment variable name: ${varName}` };
    }

    return { valid: true };
  }

  /**
   * Validate file source format
   */
  private validateFileSource(source: string): { valid: boolean; error?: string } {
    const filePath = source.replace('file://', '');
    
    if (!filePath) {
      return { valid: false, error: 'File path cannot be empty' };
    }

    // Check for potentially dangerous paths
    if (filePath.includes('..')) {
      return { valid: false, error: 'File path cannot contain ".." for security reasons' };
    }

    return { valid: true };
  }

  /**
   * Validate Vault source format
   */
  private validateVaultSource(source: string): { valid: boolean; error?: string } {
    const urlPart = source.replace('vault://', '');
    const [pathPart, queryPart] = urlPart.split('?');
    
    if (!pathPart) {
      return { valid: false, error: 'Vault path cannot be empty' };
    }

    // Validate query parameters if present
    if (queryPart) {
      try {
        const params = new URLSearchParams(queryPart);
        const key = params.get('key');
        if (key && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          return { valid: false, error: `Invalid key name in Vault URL: ${key}` };
        }
      } catch (error) {
        return { valid: false, error: 'Invalid query parameters in Vault URL' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate AWS source format
   */
  private validateAwsSource(source: string): { valid: boolean; error?: string } {
    const urlPart = source.replace('aws://', '');
    const [pathPart, queryPart] = urlPart.split('?');
    
    if (!pathPart) {
      return { valid: false, error: 'AWS secret name cannot be empty' };
    }

    // Validate query parameters if present
    if (queryPart) {
      try {
        const params = new URLSearchParams(queryPart);
        const key = params.get('key');
        const region = params.get('region');
        
        if (key && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          return { valid: false, error: `Invalid key name in AWS URL: ${key}` };
        }
        
        if (region && !/^[a-z0-9-]+$/.test(region)) {
          return { valid: false, error: `Invalid AWS region format: ${region}` };
        }
      } catch (error) {
        return { valid: false, error: 'Invalid query parameters in AWS URL' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate Azure source format
   */
  private validateAzureSource(source: string): { valid: boolean; error?: string } {
    const urlPart = source.replace('azure://', '');
    const [pathPart, queryPart] = urlPart.split('?');
    
    const pathSegments = pathPart.split('/');
    if (pathSegments.length !== 2) {
      return { valid: false, error: 'Azure URL must have format: azure://vault-name/secret-name' };
    }
    
    const [vaultName, secretName] = pathSegments;
    
    if (!vaultName || !secretName) {
      return { valid: false, error: 'Azure vault name and secret name cannot be empty' };
    }

    // Validate Azure Key Vault naming rules
    if (!/^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(vaultName) || vaultName.length < 3 || vaultName.length > 24) {
      return { valid: false, error: 'Invalid Azure Key Vault name format' };
    }

    if (!/^[a-zA-Z0-9-]+$/.test(secretName) || secretName.length > 127) {
      return { valid: false, error: 'Invalid Azure secret name format' };
    }

    return { valid: true };
  }

  /**
   * Validate GCP source format
   */
  private validateGcpSource(source: string): { valid: boolean; error?: string } {
    const urlPart = source.replace('gcp://', '');
    const [pathPart, queryPart] = urlPart.split('?');
    
    const pathSegments = pathPart.split('/');
    if (pathSegments.length !== 2) {
      return { valid: false, error: 'GCP URL must have format: gcp://project-id/secret-name' };
    }
    
    const [projectId, secretName] = pathSegments;
    
    if (!projectId || !secretName) {
      return { valid: false, error: 'GCP project ID and secret name cannot be empty' };
    }

    // Validate GCP project ID format
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(projectId) || projectId.length < 6 || projectId.length > 30) {
      return { valid: false, error: 'Invalid GCP project ID format' };
    }

    // Validate GCP secret name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(secretName)) {
      return { valid: false, error: 'Invalid GCP secret name format' };
    }

    return { valid: true };
  }

  /**
   * Validate resolved secret value
   */
  public validateResolvedValue(value: string, source: string): { valid: boolean; error?: string } {
    if (value === undefined || value === null) {
      return { valid: false, error: `Resolved secret value is null or undefined for source: ${source}` };
    }

    if (typeof value !== 'string') {
      return { valid: false, error: `Resolved secret value must be a string for source: ${source}` };
    }

    if (value.length === 0) {
      return { valid: false, error: `Resolved secret value is empty for source: ${source}` };
    }

    // Check for common placeholder values that indicate resolution failure
    const placeholders = ['null', 'undefined', 'N/A', 'n/a', 'NULL', 'UNDEFINED'];
    if (placeholders.includes(value.trim())) {
      return { valid: false, error: `Resolved secret appears to be a placeholder value: ${value}` };
    }

    return { valid: true };
  }

  /**
   * Validate credential field configuration
   */
  public validateCredentialField(
    directValue: string | undefined,
    sourceValue: string | undefined,
    fieldName: string,
    accountName: string
  ): { valid: boolean; error?: string } {
    // Validate that both direct and source values are not provided
    if (directValue && sourceValue) {
      return {
        valid: false,
        error: `Account "${accountName}": Cannot specify both ${fieldName} and ${fieldName}Source`
      };
    }

    // If neither is provided, that's valid (field is optional)
    if (!directValue && !sourceValue) {
      return { valid: true };
    }

    // If source value is provided, validate it
    if (sourceValue) {
      return this.validateSource(sourceValue);
    }

    // If direct value is provided and looks like an environment variable, validate it
    if (directValue && directValue.startsWith('${') && directValue.endsWith('}')) {
      return this.validateEnvironmentVariable(directValue);
    }

    return { valid: true };
  }
}