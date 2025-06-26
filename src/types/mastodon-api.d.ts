declare module 'mastodon-api' {
  interface MastodonConfig {
    access_token: string;
    api_url: string;
  }

  interface MastodonResponse<T = any> {
    data: T;
  }

  interface MastodonAccount {
    id: string;
    username: string;
    display_name: string;
    followers_count: number;
    following_count: number;
    statuses_count: number;
    avatar: string;
    header: string;
    note: string;
    url: string;
    created_at: string;
  }


  class Mastodon {
    constructor(config: MastodonConfig);
    
    post(endpoint: string, params?: any): Promise<MastodonResponse>;
    get(endpoint: string, params?: any): Promise<MastodonResponse>;
    patch(endpoint: string, params?: any): Promise<MastodonResponse>;
    delete(endpoint: string, params?: any): Promise<MastodonResponse>;
  }

  export = Mastodon;
}