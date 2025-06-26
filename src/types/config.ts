export interface BotConfig {
  mastodon: {
    instance: string;
    accessToken: string;
  };
  bot: {
    message: string;
    cronSchedule: string;
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