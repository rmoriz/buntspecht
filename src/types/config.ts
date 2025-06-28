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
    providers: ProviderConfig[];
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