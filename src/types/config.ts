export interface AccountConfig {
  name: string;
  instance: string;
  accessToken: string;
}

export interface ProviderConfig {
  name: string;
  type: string;
  cronSchedule?: string; // Optional for push providers
  enabled?: boolean;
  accounts: string[]; // Array of account names to post to
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

export interface BotConfig {
  accounts: AccountConfig[];
  bot: {
    providers: ProviderConfig[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  telemetry?: TelemetryConfig;
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
}