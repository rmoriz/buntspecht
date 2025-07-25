import { Logger } from '../../utils/logger';
import { SecretProvider } from './types';
import {
  EnvironmentSecretProvider,
  FileSecretProvider,
  VaultSecretProvider,
  AWSSecretsProvider,
  AzureKeyVaultProvider,
  GCPSecretManagerProvider
} from './SecretProviders';

/**
 * Manages secret provider registration and lifecycle
 */
export class SecretProviderManager {
  private providers: SecretProvider[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeBuiltInProviders();
  }

  /**
   * Initialize built-in providers
   */
  private initializeBuiltInProviders(): void {
    // Register built-in providers
    this.registerProvider(new EnvironmentSecretProvider());
    this.registerProvider(new FileSecretProvider());
    
    // Register external providers only if dependencies are available
    try {
      this.registerProvider(new VaultSecretProvider(this.logger));
    } catch {
      this.logger.debug('Vault provider not available: node-vault package not installed');
    }
    
    try {
      this.registerProvider(new AWSSecretsProvider(this.logger));
    } catch {
      this.logger.debug('AWS Secrets Manager provider not available: @aws-sdk/client-secrets-manager package not installed');
    }
    
    try {
      this.registerProvider(new AzureKeyVaultProvider(this.logger));
    } catch {
      this.logger.debug('Azure Key Vault provider not available: @azure/keyvault-secrets and @azure/identity packages not installed');
    }
    
    try {
      this.registerProvider(new GCPSecretManagerProvider(this.logger));
    } catch {
      this.logger.debug('Google Cloud Secret Manager provider not available: @google-cloud/secret-manager package not installed');
    }
  }

  /**
   * Register a new secret provider
   */
  public registerProvider(provider: SecretProvider): void {
    this.providers.push(provider);
    this.logger.debug(`Registered secret provider: ${provider.name}`);
  }

  /**
   * Find a provider that can handle the given source
   */
  public findProvider(source: string): SecretProvider | undefined {
    return this.providers.find(provider => provider.canHandle(source));
  }

  /**
   * Get all registered providers
   */
  public getProviders(): SecretProvider[] {
    return [...this.providers];
  }

  /**
   * Get list of available provider names
   */
  public getAvailableProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  /**
   * Check if a specific provider is available
   */
  public isProviderAvailable(providerName: string): boolean {
    return this.providers.some(p => p.name === providerName);
  }

  /**
   * Remove a provider by name
   */
  public removeProvider(providerName: string): boolean {
    const index = this.providers.findIndex(p => p.name === providerName);
    if (index !== -1) {
      this.providers.splice(index, 1);
      this.logger.debug(`Removed secret provider: ${providerName}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all providers
   */
  public clearProviders(): void {
    this.providers = [];
    this.logger.debug('Cleared all secret providers');
  }
}