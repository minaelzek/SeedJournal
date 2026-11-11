# Staging and rollback notes

## Staging smoke check

Deploy target is Cloudflare Workers and the D1 database named in
`wrangler.toml`. `.openai/hosting.json` is not a deploy target.

Run the local Cloudflare preview after the runtime configuration is
available:

```text
SEED_JOURNAL_E2E_BASE_URL=http://127.0.0.1:8787 npm run verify:staging
```

The Playwright runner and `axe-core` are intentionally limited to development
dependencies. They support release verification without adding runtime weight
to the Worker.

The smoke flow uses deterministic authenticated request headers, creates or
unlocks a disposable vault, verifies the core journal journey, and exercises
desktop, 375px reduced-motion, keyboard, offline-save, export, and delete
paths. Use a disposable staging identity and database only.

Before a staging release, confirm:

- the expected D1 binding is attached;
- migrations have completed successfully;
- the smoke flow passes from a clean disposable account;
- request IDs and error responses are visible in the staging logs;
- no production data is used by the test identity.

Apply Cloudflare platform rate limiting to the public API routes in the
deployment environment. Seed Journal intentionally does not add a custom D1
rate limiter to the application.

## Rollback

Roll back the Worker release to the previously known-good build using
the Cloudflare deployment history. Do not reset D1 as part of an application
rollback. If a schema migration is not backward compatible, stop the rollout
and restore the last compatible application/schema pair instead of applying an
ad-hoc reverse migration.

After rollback, verify `/welcome`, authenticated bootstrap, vault unlock, and
one read-only archive request. Record the deployment identifier, migration
state, incident symptoms, and the verification result.

## Local reset

Database reset is intentionally destructive and belongs only in the disposable
local/staging workflow. It must require the explicit confirmation token exposed
by the integration tooling; ordinary migration execution must never reset data.
