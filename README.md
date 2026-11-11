# Seed Journal

Seed Journal is a private reflection ritual centered on a living, procedural
sakura tree. Sign in with Google or Apple. Entries are encrypted at rest in
Cloudflare D1 and stay private to your signed-in account.

## Product shape

- Google and Apple sign-in with account-scoped records
- Session-wrapped AES-GCM journal keys (no passphrase to remember)
- Deterministic, local reflection prompts with no paid AI dependency
- Living Sakura v2 hero on a Japanese zen micro-stage; static seed mark if WebGL is unavailable
- Journaling-as-nurture: every intentional complete grows the same companion (equal memory petal + surrounding life) — never streaks, XP, or grades
- Encrypted autosave, local search, export, revisit, and deletion flows
- Continuous product film (home ↔ ritual ↔ reveal ↔ archive) with springy controls and reduced-motion support

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

`npm run dev` applies local D1 migrations first. On a fresh machine that is what creates the account tables. `npm run db:migrate` does only that step.

Open [http://127.0.0.1:3000/welcome](http://127.0.0.1:3000/welcome). On loopback, outside a production build, “Continue in this garden” opens a local session. That path is refused for any other host. Google and Apple appear only when `GOOGLE_CLIENT_ID` and `APPLE_CLIENT_ID` are set in the Worker environment.

## Environment

Put local values in `.dev.vars`. That file is gitignored.

| Name | Required | Purpose |
| --- | --- | --- |
| `ACCOUNT_WRAP_KEY` | Production | 32 random bytes, standard base64. Wraps every account data key. Losing it makes existing journals unreadable. Do not use the development wrap key. `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | When Google sign-in is on | Google Identity Services client id |
| `APPLE_CLIENT_ID` | When Apple sign-in is on | Apple Services ID |
| `SEED_JOURNAL_DEV_AUTH` | Never in production | `1` enables the local garden even when `NODE_ENV` is not `development`. Ignored when `NODE_ENV` is `production`. Do not set it on a public host. |

A production build refuses the shared local account, client-supplied `oai-authenticated-user-id` headers, and the built-in development wrap key. `npm run dev` binds to `127.0.0.1` so those local paths stay on this machine.

```bash
npm test
npm run verify
```

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

Checked-in SQL lives in `drizzle/`. Wrangler uses a placeholder D1 id in `wrangler.toml` for local Miniflare. Do not commit `.dev.vars`, `.wrangler/`, or still-pack PNGs.
