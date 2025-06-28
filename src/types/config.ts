export interface AccountConfig {
  name: string;
  instance: string;
  accessToken: string;
}

export interface ProviderConfig {
  name: string;
  type: string;
  cronSchedule: string;
  enabled?: boolean;
  accounts: string[]; // Array of account names to post to
  config: { [key: string]: unknown };
}

export interface BotConfig {
  accounts: AccountConfig[];
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