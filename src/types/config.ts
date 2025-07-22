export interface AccountConfig {
  name: string;
  type?: string;
  instance?: string; // Optional - defaults to appropriate service (https://bsky.social for Bluesky)
  accessToken?: string; // Optional for Bluesky (uses identifier+password instead)
  defaultVisibility?: 'public' | 'unlisted' | 'private' | 'direct';
  // Bluesky-specific fields
  identifier?: string; // Bluesky handle or DID
  password?: string; // Bluesky app password
  
  // External secret source fields
  accessTokenSource?: string; // External source for accessToken (vault://, aws://, file://, etc.)
  identifierSource?: string; // External source for identifier
  passwordSource?: string; // External source for password
  instanceSource?: string; // External source for instance (if needed)
}

export interface ProviderConfig {
  name: string;
  type: string;
  cronSchedule?: string; // Optional for push providers
  enabled?: boolean;
  accounts: string[]; // Array of account names to post to
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  config: { [key: string]: unknown };
  // Template configuration for push providers
  template?: string; // Default template for JSON processing
  templates?: { [key: string]: string }; // Named templates (e.g., "github.push", "gitlab.pipeline")
  // Webhook configuration for push providers
  webhookPath?: string; // Custom webhook path for this provider (e.g., "/webhook/github")
}

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  jaeger?: {
    enabled: boolean;
    endpoint?: string;
  };
  prometheus?: {
    enabled: boolean;
    port?: number;
    endpoint?: string;
  };
  tracing?: {
    enabled: boolean;
  };
  metrics?: {
    enabled: boolean;
  };
}

export interface WebhookConfig {
  enabled: boolean;
  port: number;
  host?: string;
  path?: string;
  secret?: string;
  hmacSecret?: string;
  hmacAlgorithm?: 'sha1' | 'sha256' | 'sha512';
  hmacHeader?: string;
  allowedIPs?: string[];
  maxPayloadSize?: number;
  timeout?: number;
}

export interface SecretRotationConfig {
  enabled: boolean;
  checkInterval?: string; // Cron expression, default: "0 */15 * * * *" (every 15 minutes)
  retryOnFailure?: boolean;
  retryDelay?: number; // seconds
  maxRetries?: number;
  notifyOnRotation?: boolean;
  testConnectionOnRotation?: boolean;
}

export interface BotConfig {
  accounts: AccountConfig[];
  bot: {
    providers: ProviderConfig[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  telemetry?: TelemetryConfig;
  webhook?: WebhookConfig;
  secretRotation?: SecretRotationConfig;
}

export interface CliOptions {
  config?: string;
  testPost?: boolean;
  testProvider?: string;
  triggerProvider?: string;
  listProviders?: boolean;
  verify?: boolean;
  verifySecrets?: boolean;
  about?: boolean;
  triggerPush?: string;
  triggerPushMessage?: string;
  listPushProviders?: boolean;
  pushProviderStatus?: string;
  webhookStatus?: boolean;
  secretRotationStatus?: boolean;
  checkSecretRotations?: boolean;
  listMonitoredSecrets?: boolean;
  warmCache?: boolean;
}