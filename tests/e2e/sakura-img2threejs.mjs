import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

async function assertNoSeriousA11y(page, label) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ["violations"],
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

test("growth-constrained Sakura stages remain distinct and renderable", async ({
  page,
}, testInfo) => {
  for (const units of [0, 1, 12, 48, 96, 192]) {
    const staticQuery = units >= 12 ? "&static=1" : "";
    await page.goto(`/img2threejs?units=${units}&clean=1${staticQuery}`, {
      waitUntil: "domcontentloaded",
    });
    const canvas = page.getByLabel(
      "Interactive three-dimensional sakura tree reconstruction",
    );
    await canvas.waitFor({ state: "visible" });
    await page.waitForTimeout(units < 12 ? 1_000 : 500);
    const box = await canvas.boundingBox();
    assert.ok(box && box.width >= 320 && box.height >= 480);
    const stagePath = resolve(`.img2threejs/renders/growth-stage-${units}.png`);
    await page.screenshot({ path: stagePath });
    await testInfo.attach(`sakura-stage-${units}.png`, {
      path: stagePath,
      contentType: "image/png",
    });
  }

});

test("mature Sakura remains non-degenerate through orbit views", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1_254, height: 1_254 });
  await page.goto(
    "/img2threejs?units=192&clean=1&static=1&reference=1",
    { waitUntil: "domcontentloaded" },
  );
  const referenceCanvas = page.getByLabel(
    "Interactive three-dimensional sakura tree reconstruction",
  );
  await referenceCanvas.waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  const referencePath = resolve(
    ".img2threejs/renders/growth-reference-angle.png",
  );
  await page.screenshot({ path: referencePath });
  await testInfo.attach("sakura-reference-angle.png", {
    path: referencePath,
    contentType: "image/png",
  });

  await page.goto(
    "/img2threejs?units=192&clean=1&manual=1&reference=1",
    {
    waitUntil: "domcontentloaded",
    },
  );
  const orbitCanvas = page.getByLabel(
    "Interactive three-dimensional sakura tree reconstruction",
  );
  await orbitCanvas.waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  const orbitBox = await orbitCanvas.boundingBox();
  assert.ok(orbitBox);
  const centerX = orbitBox.x + orbitBox.width / 2;
  const centerY = orbitBox.y + orbitBox.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + orbitBox.width * 0.24, centerY, {
    steps: 4,
  });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const sidePath = resolve(".img2threejs/renders/growth-orbit-side.png");
  await page.screenshot({ path: sidePath });
  await testInfo.attach("sakura-orbit-side.png", {
    path: sidePath,
    contentType: "image/png",
  });

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + orbitBox.width * 0.22, centerY, {
    steps: 4,
  });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const rearPath = resolve(".img2threejs/renders/growth-orbit-rear.png");
  await page.screenshot({ path: rearPath });
  await testInfo.attach("sakura-orbit-rear.png", {
    path: rearPath,
    contentType: "image/png",
  });
});

test("integrated Sakura supports mouse, keyboard, reduced motion, and axe", async ({
  browser,
  page,
}, testInfo) => {
  await page.goto("/img2threejs/product", { waitUntil: "domcontentloaded" });
  const tree = page.getByRole("group", { name: /mature sakura with 32 memories/i });
  await tree.waitFor({ state: "visible" });
  const firstMemory = page.getByRole("button", {
    name: "Open tree memory 1",
    exact: true,
  });
  await firstMemory.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("status").filter({ hasText: "Selected memory 1" }).waitFor();
  assert.equal(await firstMemory.getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".sj-img2threejs-hotspot").count(), 32);
  await assertNoSeriousA11y(page, "integrated desktop Sakura");
  const desktopPath = resolve(
    ".img2threejs/renders/growth-integrated-desktop.png",
  );
  await page.screenshot({ path: desktopPath });
  await testInfo.attach("sakura-integrated-desktop.png", {
    path: desktopPath,
    contentType: "image/png",
  });

  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  const mobilePage = await mobile.newPage();
  try {
    await mobilePage.goto("/img2threejs/product", {
      waitUntil: "domcontentloaded",
    });
    await mobilePage
      .getByRole("group", { name: /mature sakura with 32 memories/i })
      .waitFor({ state: "visible" });
    await mobilePage.waitForFunction(() =>
      document
        .querySelector(".sj-garden-scene")
        ?.hasAttribute("data-reduced-motion"),
    );
    await mobilePage
      .getByRole("button", { name: "Open tree memory 1", exact: true })
      .waitFor({ state: "visible" });
    await mobilePage.waitForFunction(
      () => document.querySelectorAll(".sj-img2threejs-hotspot").length === 32,
    );
    const layout = await mobilePage.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      reducedMotion: Boolean(
        document
          .querySelector(".sj-garden-scene")
          ?.hasAttribute("data-reduced-motion"),
      ),
      hotspotCount: document.querySelectorAll(".sj-img2threejs-hotspot").length,
      navigation: performance.getEntriesByType("navigation")[0]?.duration ?? null,
    }));
    assert.ok(layout.documentWidth <= layout.viewport + 1);
    assert.equal(layout.reducedMotion, true);
    assert.equal(layout.hotspotCount, 32);
    await assertNoSeriousA11y(mobilePage, "integrated mobile Sakura");
    const mobilePath = resolve(
      ".img2threejs/renders/growth-integrated-mobile.png",
    );
    await mobilePage.screenshot({ path: mobilePath });
    await testInfo.attach("sakura-integrated-mobile.png", {
      path: mobilePath,
      contentType: "image/png",
    });
    await testInfo.attach("sakura-mobile-performance.json", {
      body: JSON.stringify(layout, null, 2),
      contentType: "application/json",
    });
  } finally {
    await mobile.close();
  }
});
