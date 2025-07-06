export interface AccountConfig {
  name: string;
  type?: string;
  instance: string;
  accessToken: string;
  defaultVisibility?: 'public' | 'unlisted' | 'private' | 'direct';
  // Bluesky-specific fields
  identifier?: string; // Bluesky handle or DID
  password?: string; // Bluesky app password
}

export interface ProviderConfig {
  name: string;
  type: string;
  cronSchedule?: string; // Optional for push providers
  enabled?: boolean;
  accounts: string[]; // Array of account names to post to
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  config: { [key: string]: unknown };
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
  allowedIPs?: string[];
  maxPayloadSize?: number;
  timeout?: number;
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
}

export interface CliOptions {
  config?: string;
  testPost?: boolean;
  testProvider?: string;
  listProviders?: boolean;
  verify?: boolean;
  about?: boolean;
  triggerPush?: string;
  triggerPushMessage?: string;
  listPushProviders?: boolean;
  pushProviderStatus?: string;
  webhookStatus?: boolean;
}