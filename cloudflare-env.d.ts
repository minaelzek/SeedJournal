declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    ASSETS: Fetcher;
    ACCOUNT_WRAP_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    APPLE_CLIENT_ID?: string;
    /** Comma-separated extra https origins. Unset while production is one workers.dev host. */
    SEED_JOURNAL_ALLOWED_ORIGINS?: string;
  };
}
