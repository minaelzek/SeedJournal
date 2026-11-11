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
| `SEED_JOURNAL_ALLOWED_ORIGINS` | No | Comma-separated extra `https` origins for a custom-domain cutover. Leave unset while the only public host is this Worker's `workers.dev` URL. |

A production build refuses the shared local account, client-supplied `oai-authenticated-user-id` headers, and the built-in development wrap key. `npm run dev` binds to `127.0.0.1` so those local paths stay on this machine.

```bash
npm test
npm run verify
```

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

Checked-in SQL lives in `drizzle/`. Do not commit `.dev.vars`, `.wrangler/`, or still-pack PNGs.

## Deploy (Cloudflare Workers)

The deploy target is Cloudflare Workers on the free `workers.dev` hostname,
plus the D1 database `seedjournal`
(`7dec0e1e-ac67-46ac-9a6a-ad1ab91fae68`) in account
`7642aefd370cf6a69cd4130786ea06cc`. The binding name is `DB`.
`.openai/hosting.json` is a retired ChatGPT Sites record and is not deployed.
There is no custom domain yet. `workers_dev = true` in `wrangler.toml`.

This repo does not deploy itself. From a machine that is logged in with
Wrangler:

```bash
npm run build
npx wrangler d1 migrations apply seedjournal --remote
npx wrangler secret put ACCOUNT_WRAP_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put APPLE_CLIENT_ID
npx wrangler deploy --config dist/server/wrangler.json
```

`wrangler deploy` prints the live origin, shaped like
`https://seed-journal.<account-subdomain>.workers.dev`. Use that exact origin.
Do not register `https://workers.dev` or a wildcard.

Before Google or Apple sign-in will succeed on that host:

- Google Cloud Console → Authorized JavaScript origins: the workers.dev origin.
- Apple Developer → Services ID → Return URLs: the same origin. The button
  sends `redirectURI: window.location.origin`.

Mutations accept that request's own `Origin`. A different `*.workers.dev` host
is rejected. HSTS on `workers.dev` is `max-age=15552000` with no
`includeSubDomains`, because this hostname sits on Cloudflare's shared suffix.
`workers.dev` is already HTTPS-only.

`ACCOUNT_WRAP_KEY` is 32 random bytes of standard base64
(`openssl rand -base64 32`). Store a copy outside the repo. Migrations are
not applied by `wrangler deploy`; run the migrations command before the first
deploy and again whenever `drizzle/` changes. Confirm `/api/health` returns
`{"ok":true,"database":"up"}` after the Worker is live. Roll back the Worker
from the Cloudflare deployment history. Do not reset D1 as part of an
application rollback.

### Adding a custom domain later

1. Uncomment the `[[routes]]` example in `wrangler.toml` and set the hostname.
2. Add that `https` origin in Google and Apple next to the workers.dev origin.
3. Deploy again. Requests to the custom domain are trusted as their own
   origin, and HSTS on that hostname includes `includeSubDomains`.
4. Leave `workers_dev = true` until you want the workers.dev URL to stop.
5. Set `SEED_JOURNAL_ALLOWED_ORIGINS` only if a page on one host must send
   credentialed mutations to the other during the cutover.
