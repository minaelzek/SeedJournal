import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("ships Seed Journal product metadata and protected routes", async () => {
  const [page, layout, packageJson, hosting, wrangler] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.toml", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ProtectedSeedJournal/);
  assert.match(layout, /Seed Journal/);
  assert.match(layout, /Nurture what grows within\./);
  assert.match(layout, /\/og\.png/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  const hostingRecord = JSON.parse(hosting);
  assert.equal(hostingRecord.deploy_target, false);
  assert.equal(hostingRecord.d1, null);
  assert.match(wrangler, /binding = "DB"/);
  assert.match(
    wrangler,
    /database_id = "7dec0e1e-ac67-46ac-9a6a-ad1ab91fae68"/,
  );
});

test("includes privacy, reflection, and garden production surfaces", async () => {
  await Promise.all(
    [
      "app/api/bootstrap/route.ts",
      "app/api/entries/[id]/complete/route.ts",
      "db/schema.ts",
      "drizzle/0000_uneven_mesmero.sql",
      "features/app/SeedJournalApp.tsx",
      "features/reflection/engine.ts",
      "features/journal/JournalRitual.tsx",
      "features/garden/SakuraScene.tsx",
      "features/archive/ArchiveView.tsx",
      "lib/crypto/vault.ts",
      "public/og.png",
    ].map((path) => access(new URL(`../${path}`, import.meta.url))),
  );

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});
