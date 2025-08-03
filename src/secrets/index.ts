// Export main secret management components
export { SecretManager } from './SecretManager';
export { SecretCache, type CacheStats } from './SecretCache';
export { RotationDetector, type RotationStats } from './RotationDetector';

// Export types
export * from './types';
export type { SecretProvider } from './types';

// Export providers
export { BaseSecretProvider } from './providers/BaseSecretProvider';
export { FileSecretProvider } from './providers/FileSecretProvider';
export { VaultSecretProvider } from './providers/VaultSecretProvider';
export { AwsSecretProvider } from './providers/AwsSecretProvider';