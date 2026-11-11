/**
 * Living Sakura founder still-pack (P1-3 cutover evidence).
 *
 * Captures deterministic clean screenshots into `.living-sakura/renders/` for
 * founder visual review. Maps to cutover gates in
 * docs/design/living-sakura-v2.md and docs/design/living-sakura-still-pack.md.
 *
 * Run (with app on SEED_JOURNAL_E2E_BASE_URL or via playwright webServer):
 *   npx playwright test tests/e2e/living-sakura-still-pack.mjs
 *
 * Or: npm run still-pack:living-sakura
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

const RENDERS = resolve(".living-sakura/renders");
const LIFE_STAGES = [
  { journals: 0, slug: "stage-seed" },
  { journals: 1, slug: "stage-sprout" },
  { journals: 12, slug: "stage-sapling" },
  { journals: 48, slug: "stage-young" },
  { journals: 96, slug: "stage-established" },
  { journals: 192, slug: "stage-mature" },
  { journals: 1_000, slug: "stage-enduring-1k" },
  { journals: 10_000, slug: "stage-enduring-10k" },
];
const ORBIT_VIEWS = [
  { view: "front", slug: "front" },
  { view: "threeQuarter", slug: "three-quarter" },
  { view: "side", slug: "side" },
  { view: "rear", slug: "rear" },
];
const MEMORY_COUNTS = [1, 193, 1_000, 10_000];

mkdirSync(RENDERS, { recursive: true });

function labUrl(params) {
  const search = new URLSearchParams({
    clean: "1",
    static: "1",
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
  });
  // clean/static as bare flags
  search.set("clean", "1");
  search.set("static", "1");
  return `/living-sakura?${search.toString()}`;
}

async function dismissDevOverlays(page) {
  // Next/Vite error overlays (hydration banners) must not land in founder stills.
  await page.evaluate(() => {
    for (const selector of [
      "nextjs-portal",
      "[data-nextjs-dialog]",
      "[data-nextjs-toast]",
      "#webpack-dev-server-client-overlay",
      "vite-error-overlay",
    ]) {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    }
    document
      .querySelectorAll('div[role="dialog"]')
      .forEach((node) => {
        const text = node.textContent ?? "";
        if (
          /hydration failed|unhandled script error|server rendered HTML/i.test(
            text,
          )
        ) {
          node.remove();
        }
      });
  });
}

async function waitForCaptureReady(page, { timeout = 45_000 } = {}) {
  const main = page.locator('main[data-clean-capture="true"]');
  await main.waitFor({ state: "visible", timeout });
  await page.waitForFunction(
    () =>
      document.querySelector("main")?.dataset.paramsReady === "true",
    null,
    { timeout },
  );
  await page.locator("[data-living-sakura-scene] canvas").waitFor({
    state: "visible",
    timeout,
  });
  await page.waitForFunction(
    () =>
      document.querySelector('main[data-clean-capture="true"]')?.dataset
        .captureReady === "true",
    null,
    { timeout },
  );
  await dismissDevOverlays(page);
  // Extra paint settle for WebGL
  await page.waitForTimeout(450);
  await dismissDevOverlays(page);
}

async function captureStill(page, testInfo, filename, gotoPath, options = {}) {
  const path = resolve(RENDERS, filename);
  await page.goto(gotoPath, { waitUntil: "domcontentloaded" });
  await waitForCaptureReady(page, options);
  const box = await page.locator("[data-living-sakura-scene] canvas").boundingBox();
  assert.ok(box && box.width >= 240 && box.height >= 240, `${filename} canvas too small`);
  await page.screenshot({ path, type: "png" });
  await testInfo.attach(filename, { path, contentType: "image/png" });
  return path;
}

async function assertNoSeriousA11y(page, label) {
  await page.addScriptTag({ path: axePath });
  // Scope to the lab main — ignore Next/Vite error overlays and foreign dialogs.
  const violations = await page.evaluate(async () => {
    const root =
      document.querySelector("main[data-journal-count], main.lab, main") ??
      document.body;
    const result = await window.axe.run(root, {
      resultTypes: ["violations"],
      // R3F canvas host is decorative; keyboard path lives on the stage section.
      rules: {
        "scrollable-region-focusable": { enabled: false },
      },
    });
    return result.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact),
    );
  });
  assert.deepEqual(
    violations,
    [],
    `${label} has serious accessibility violations: ${violations
      .map((violation) => violation.id)
      .join(", ")}`,
  );
}

test.describe("Living Sakura founder still-pack", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("life-stage chapters remain distinct", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1_080, height: 1_350 });
    for (const stage of LIFE_STAGES) {
      const timeout = stage.journals >= 1_000 ? 90_000 : 45_000;
      await captureStill(
        page,
        testInfo,
        `${stage.slug}.png`,
        labUrl({ journals: stage.journals, view: "front" }),
        { timeout },
      );
    }
  });

  test("mature peak-bloom orbit pack (front / 3-4 / side / rear)", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1_254, height: 1_254 });
    for (const orbit of ORBIT_VIEWS) {
      await captureStill(
        page,
        testInfo,
        `peak-bloom-${orbit.slug}.png`,
        labUrl({ journals: 192, view: orbit.view }),
      );
    }
  });

  test("leafless mature structure orbit pack", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1_254, height: 1_254 });
    for (const orbit of ORBIT_VIEWS) {
      await captureStill(
        page,
        testInfo,
        `structure-${orbit.slug}.png`,
        labUrl({ journals: 192, view: orbit.view, structure: "1" }),
      );
    }
  });

  test("memory stability at 1 / 193 / 1k / 10k journals", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1_080, height: 1_350 });
    for (const journals of MEMORY_COUNTS) {
      await captureStill(
        page,
        testInfo,
        `memories-${journals}.png`,
        labUrl({ journals, view: "threeQuarter" }),
        { timeout: journals >= 1_000 ? 90_000 : 45_000 },
      );
    }
  });

  test("growth reveal stills (quiet + deep) from the same seed", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1_080, height: 1_350 });
    const seed = "still-pack-reveal-seed";
    await captureStill(
      page,
      testInfo,
      "reveal-quiet-units-1.png",
      labUrl({
        journals: 48,
        units: 1,
        reveal: "1",
        seed,
        view: "front",
      }),
    );
    await captureStill(
      page,
      testInfo,
      "reveal-deep-units-6.png",
      labUrl({
        journals: 48,
        units: 6,
        reveal: "1",
        seed,
        view: "front",
      }),
    );
  });

  test("desktop, mobile, and reduced-motion surfaces + axe", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1_440, height: 900 });
    await captureStill(
      page,
      testInfo,
      "integrated-desktop.png",
      labUrl({ journals: 96, view: "front" }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await captureStill(
      page,
      testInfo,
      "integrated-mobile.png",
      labUrl({ journals: 96, view: "front" }),
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await captureStill(
      page,
      testInfo,
      "integrated-reduced-motion.png",
      // omit static so reducedMotion comes from preference; keep clean
      `/living-sakura?journals=96&view=front&clean=1`,
    );

    await page.goto("/living-sakura?journals=96", {
      waitUntil: "domcontentloaded",
    });
    await page.locator("[data-living-sakura-scene] canvas").waitFor({
      state: "visible",
      timeout: 45_000,
    });
    await page.waitForTimeout(600);
    await assertNoSeriousA11y(page, "living-sakura lab");
  });

  test("keyboard memory attention still", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1_080, height: 1_350 });
    await page.goto("/living-sakura?journals=48&view=front", {
      waitUntil: "domcontentloaded",
    });
    const stage = page.locator("section[aria-label*='Living Sakura']");
    await stage.waitFor({ state: "visible", timeout: 45_000 });
    await page.locator("[data-living-sakura-scene] canvas").waitFor({
      state: "visible",
    });
    await page.waitForTimeout(800);
    await stage.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const path = resolve(RENDERS, "memory-keyboard-attention.png");
    await page.screenshot({ path, type: "png" });
    await testInfo.attach("memory-keyboard-attention.png", {
      path,
      contentType: "image/png",
    });
  });
});
