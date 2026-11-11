# Seed Journal release verification

**Verification date:** 2026-08-06  
**Scope:** private-beta and public-production engineering gates  
**Deployment:** not performed; Worker/Sites dry-run only

## Product renderer (current truth)

| Surface | Status |
|---|---|
| **Living Sakura v2** (`gardenRenderer="living"`) | **Product default** in `AppFrame` |
| Static seed mark (`GardenFallback`) | Demotion when WebGL is unavailable or the living scene errors |
| Legacy WebGL / img2threejs | Diagnostic / non-product only — must not be re-promoted |

Founder still-pack visual YES remains an open human gate:
[`docs/design/living-sakura-still-pack.md`](../design/living-sakura-still-pack.md).

## Results (historical 2026-08-04 engineering pass)

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` | Pass |
| `npm run dev` → `/welcome` | Pass; HTTP 200 |
| `npm run start -- --port 3105` → `/welcome` | Pass; HTTP 200 |
| `npm run verify` | Pass: lint, typecheck, unit tests, integration, build, production audit |
| `npm run test:e2e` | Pass: browser smoke covering journal flow, stages, input, mobile, reduced motion, axe |
| `npm run verify:staging` | Pass: disposable D1 reset/migrations, E2E, Worker dry-run |
| `npm audit --omit=dev --audit-level=high` | Pass; 0 production vulnerabilities |
| `public/og.png` | Pass; below the 300 KB budget |
| `git diff --check` | Pass |

## Withdrawn img2threejs experiment

The previous procedural img2threejs cutover was withdrawn after founder review.
It remains diagnostic-only under `.img2threejs/renders/` and must not be described
as a production replacement.

## Release decision

Private-beta engineering foundation is in place. Public-production readiness still
requires product-owner/legal review of [`docs/privacy/export-only.md`](../privacy/export-only.md)
and explicit founder approval of the Living Sakura still-pack gates.

## Remaining known issues

- Founder still-pack visual YES is human, not agent-substitutable.
- Living Sakura continues to iterate mesh firm-YES against
  [`docs/design/living-sakura-v2.md`](../design/living-sakura-v2.md).
- Full development-only audits may report tooling advisories; production
  dependency audit remains the release security gate.
