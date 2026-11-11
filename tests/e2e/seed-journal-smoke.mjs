import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const baseURL =
  process.env.SEED_JOURNAL_E2E_BASE_URL ?? "http://127.0.0.1:8787";
const runId =
  process.env.SEED_JOURNAL_E2E_RUN_ID ?? `${Date.now()}-${process.pid}`;
const authHeaders = {
  "oai-authenticated-user-id":
    process.env.SEED_JOURNAL_E2E_USER_ID ?? `seed-journal-e2e-${runId}`,
  "oai-authenticated-user-email":
    process.env.SEED_JOURNAL_E2E_USER_EMAIL ?? "seed-journal-e2e@example.test",
};

async function isVisible(locator) {
  return locator.count().then((count) => (count > 0 ? locator.first().isVisible() : false));
}

async function waitForPrivateSession(page) {
  await page.goto("/welcome", { waitUntil: "domcontentloaded" });
  const localEnter = page.getByRole("button", { name: "Continue in this garden" });
  if (await isVisible(localEnter)) {
    await localEnter.click();
  } else {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  }

  await page.locator("main.sj-home").waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await page.getByLabel("Journal passphrase").count(), 0);
}

async function assertNoSeriousA11y(page, screenName) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) {
    await page.addScriptTag({ path: axePath });
  }
  const result = await page.evaluate(async () =>
    window.axe.run(document, {
      resultTypes: ["violations"],
    }),
  );
  const serious = result.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact),
  );
  assert.deepEqual(
    serious,
    [],
    `${screenName} has serious accessibility violations: ${serious
      .map((violation) => violation.id)
      .join(", ")}`,
  );
}

async function completeReflection(page) {
  const begin = page.getByRole("button", { name: "Begin a reflection" });
  await begin.focus();
  await page.keyboard.press("Enter");
  const body = page.getByLabel("Journal entry");
  await body.waitFor({ state: "visible", timeout: 15_000 });
  await body.fill(
    "Today I noticed a small change in how I met the next step. It felt gentler, clearer, and worth remembering.",
  );
  await page
    .locator('[role="status"]')
    .filter({ hasText: /^Saved$/ })
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Send" }).click();
  await page.locator("#sj-converse-ask").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "Leave with the tree" }).click();
  await page.getByRole("button", { name: "Return to your sakura" }).click();
  await page.locator("main.sj-home").waitFor({ state: "visible" });
}

test("Seed Journal core browser and accessibility smoke flow", async () => {
  const browser = await chromium.launch({
    headless: process.env.SEED_JOURNAL_E2E_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: authHeaders,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto("/welcome", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "A seed is waiting." }).waitFor();
    await assertNoSeriousA11y(page, "welcome");

    await waitForPrivateSession(page);
    await assertNoSeriousA11y(page, "private landing");

    await completeReflection(page);
    await assertNoSeriousA11y(page, "growth landing");

    await page.getByRole("button", { name: "Explore memory petals" }).click();
    const memory = page.getByRole("button", { name: "Open tree memory 1" });
    await memory.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Close memory" }).click();
    await page.getByRole("button", { name: "Explore memory petals" }).click();
    await memory.focus();
    await page.keyboard.press("Space");
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Close memory" }).click();

    await page.getByRole("button", { name: "Open journal archive" }).click();
    await page.getByRole("heading", { name: "Journal" }).waitFor();
    await assertNoSeriousA11y(page, "archive");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForPrivateSession(page);
    await page.getByRole("button", { name: "Open journal archive" }).click();
    await page.locator(".sj-archive__row").first().waitFor({ state: "visible" });
    await page.locator(".sj-archive__row").first().click();
    await page.locator(".sj-entry-reader").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Revisit this memory" }).click();
    await page.getByRole("button", { name: "Leave journal unfinished" }).click();

    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("heading", { name: "Journal settings" }).waitFor();
    await assertNoSeriousA11y(page, "settings");

    const encryptedDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: /Encrypted backup/ }).click();
    assert.match((await encryptedDownload).suggestedFilename(), /\.seedjournal$/);

    await page.getByRole("button", { name: /Readable pages/ }).click();
    const readableDownload = page.waitForEvent("download");
    await page
      .getByRole("group", { name: "Download readable pages" })
      .getByRole("button", { name: "Download the readable copy" })
      .click();
    assert.match((await readableDownload).suggestedFilename(), /\.md$/);

    await page.getByRole("button", { name: "Return to garden" }).click();
    await page.getByRole("button", { name: "Open journal archive" }).click();
    await page.locator(".sj-archive__row").first().click();
    await page.getByRole("button", { name: "Delete entry" }).click();
    await page.getByRole("button", { name: "Delete entry" }).last().click();
    await page.getByRole("button", { name: "Return to garden" }).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Return to garden" }).click();
    await page.getByRole("button", { name: "Lock journal" }).click();
    await page.getByRole("heading", { name: "A seed is waiting." }).waitFor();
    await waitForPrivateSession(page);
    await page.getByRole("button", { name: /Begin a reflection|Care for the sakura|Care for the tree|Continue reflection|Write another page/ }).first().click();
    await page.getByLabel("Journal entry").fill(
      "This draft is intentionally saved while offline so it can recover when the connection returns.",
    );
    await context.setOffline(true);
    await page.waitForTimeout(2_200);
    await page
      .locator(".sj-sync-status")
      .filter({ hasText: "Offline. Changes will sync when you reconnect." })
      .waitFor({ state: "visible", timeout: 15_000 });
    const syncedDraft = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/entries") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 15_000 },
    );
    await context.setOffline(false);
    await syncedDraft;

    const mobileContext = await browser.newContext({
      baseURL,
      extraHTTPHeaders: authHeaders,
      viewport: { width: 375, height: 812 },
      reducedMotion: "reduce",
    });
    const mobilePage = await mobileContext.newPage();
    try {
      await waitForPrivateSession(mobilePage);
      await assertNoSeriousA11y(mobilePage, "narrow mobile landing");
      const layout = await mobilePage.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        reducedGarden: Boolean(
          document.querySelector(
            '[data-living-sakura-scene][data-reduced-motion="true"]',
          ) ||
            document.querySelector('.sj-garden-scene[data-reduced-motion="true"]'),
        ),
      }));
      assert.ok(layout.documentWidth <= layout.viewport + 1, "mobile layout overflows horizontally");
      assert.equal(layout.reducedGarden, true, "reduced-motion garden state is missing");
      const performanceBaseline = await mobilePage.evaluate((currentLayout) => {
        const navigation = performance.getEntriesByType("navigation")[0];
        const paints = performance.getEntriesByType("paint");
        return {
          domContentLoaded:
            navigation && "domContentLoadedEventEnd" in navigation
              ? navigation.domContentLoadedEventEnd
              : null,
          responseEnd:
            navigation && "responseEnd" in navigation ? navigation.responseEnd : null,
          firstContentfulPaint:
            paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ??
            null,
          viewport: currentLayout.viewport,
          documentWidth: currentLayout.documentWidth,
        };
      }, layout);
      await test.info().attach("mobile-performance.json", {
        body: JSON.stringify(performanceBaseline, null, 2),
        contentType: "application/json",
      });
    } finally {
      await mobileContext.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }
});
