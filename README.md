# Seed Journal

Seed Journal is a private reflection ritual centered on a living, procedural
sakura tree. Entries are encrypted in the browser with a user-held passphrase
before they are stored in Cloudflare D1.

## Product shape

- ChatGPT sign-in with account-scoped records
- PBKDF2 and AES-GCM encrypted journal vault
- Deterministic, local reflection prompts with no paid AI dependency
- Illustrated 2.5D sakura hero (blossom-first) whose growth is tied to completed reflections; deep insight triggers hanami leaps
- Encrypted autosave, local search, export, revisit, and deletion flows
- Responsive, reduced-motion, keyboard, touch, and screen-reader support

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm test
```

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

The deployed database is provisioned and migrated by Sites using
`.openai/hosting.json` and the checked-in `drizzle/` migration.
