export interface BotConfig {
  mastodon: {
    instance: string;
    accessToken: string;
  };
  bot: {
    message: string;
    cronSchedule: string;
    messageProvider?: string;
    messageProviderConfig?: { [key: string]: any };
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

export interface CliOptions {
  config?: string;
  testPost?: boolean;
  verify?: boolean;
}