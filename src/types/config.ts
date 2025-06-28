export interface ProviderConfig {
  name: string;
  type: string;
  cronSchedule: string;
  enabled?: boolean;
  config: { [key: string]: unknown };
}

export interface BotConfig {
  mastodon: {
    instance: string;
    accessToken: string;
  };
  bot: {
    // Legacy single provider support (for backward compatibility)
    message?: string;
    cronSchedule?: string;
    messageProvider?: string;
    messageProviderConfig?: { [key: string]: unknown };
    
    // New multiple providers support
    providers?: ProviderConfig[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface CliOptions {
  config?: string;
  testPost?: boolean;
  testProvider?: string;
  listProviders?: boolean;
  verify?: boolean;
}