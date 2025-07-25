// Re-export the new modular secret resolver for backward compatibility
export { 
  SecretResolver,
  SecretProvider,
  EnvironmentSecretProvider,
  FileSecretProvider,
  VaultSecretProvider,
  AWSSecretsProvider,
  AzureKeyVaultProvider,
  GCPSecretManagerProvider
} from './secrets';

// This file has been refactored into a modular structure.
// The original SecretResolver class is now split into multiple components:
// - SecretResolver: Main orchestrator (coordinates between components)
// - SecretProviderManager: Provider registration and management
// - SecretCache: Caching logic for resolved secrets
// - SecretValidator: Validation of sources and resolved values
// - SecretProviders: All provider implementations (Environment, File, Vault, AWS, Azure, GCP)
//
// All functionality remains the same, but the code is now better organized
// and more maintainable with clear separation of concerns.