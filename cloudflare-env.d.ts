declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    ASSETS: Fetcher;
    ACCOUNT_WRAP_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    APPLE_CLIENT_ID?: string;
  };
}
