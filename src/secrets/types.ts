import { Logger } from '../utils/logger';
import type { TelemetryService } from '../services/telemetryInterface';

/**
 * Configuration for secret providers
 */
export interface SecretProviderConfig {
  enabled?: boolean;
  timeout?: number; // milliseconds
  retryAttempts?: number;
  retryDelay?: number; // milliseconds
  [key: string]: unknown; // Provider-specific configuration
}

/**
 * Metadata about a secret
 */
export interface SecretMetadata {
  source: string;
  provider: string;
  lastAccessed: Date;
  accessCount: number;
  lastValue?: string; // For rotation detection
  lastRotationDetected?: Date;
  expiresAt?: Date;
}

/**
 * Result of a secret resolution operation
 */
export interface SecretResult {
  value: string;
  metadata: SecretMetadata;
  cached: boolean;
}

/**
 * Interface for secret providers that can resolve external secret sources
 */
export interface SecretProvider {
  readonly name: string;
  
  /**
   * Initialize the provider with configuration
   */
  initialize(config: SecretProviderConfig, logger: Logger, telemetry?: TelemetryService): Promise<void>;
  
  /**
   * Check if this provider can handle the given source
   */
  canHandle(source: string): boolean;
  
  /**
   * Resolve a secret from the given source
   */
  resolve(source: string): Promise<string>;
  
  /**
   * Test connectivity to the secret provider
   */
  testConnection(): Promise<boolean>;
  
  /**
   * Clean up resources
   */
  cleanup(): Promise<void>;
}

/**
 * Configuration for secret caching
 */
export interface SecretCacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached secrets
  encryptCache?: boolean; // Whether to encrypt cached values
}

/**
 * Configuration for secret rotation detection
 */
export interface SecretRotationConfig {
  enabled: boolean;
  checkInterval: string; // Cron expression
  retryOnFailure: boolean;
  retryDelay: number; // seconds
  maxRetries: number;
  notifyOnRotation: boolean;
  testConnectionOnRotation: boolean;
}

/**
 * Event emitted when a secret rotation is detected
 */
export interface SecretRotationEvent {
  source: string;
  provider: string;
  oldValue: string;
  newValue: string;
  detectedAt: Date;
  accountName?: string;
  fieldName?: string;
}

/**
 * Configuration for the secret manager
 */
export interface SecretManagerConfig {
  cache?: SecretCacheConfig;
  rotation?: SecretRotationConfig;
  providers?: Record<string, SecretProviderConfig>;
  defaultTimeout?: number;
  enableTelemetry?: boolean;
}