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

Open [http://127.0.0.1:3000/welcome](http://127.0.0.1:3000/welcome). Outside production, “Continue in this garden” opens a local session. Google and Apple appear only when `GOOGLE_CLIENT_ID` and `APPLE_CLIENT_ID` are set in the Worker environment. Put those in `.dev.vars` locally. That file is gitignored.

```bash
npm test
npm run verify
```

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

Checked-in SQL lives in `drizzle/`. Wrangler uses a placeholder D1 id in `wrangler.toml` for local Miniflare. Do not commit `.dev.vars`, `.wrangler/`, or still-pack PNGs.
