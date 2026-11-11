const { chromium } = require("playwright");
const path = require("path");

const out = process.env.STILL_OUT
  ? path.resolve(process.env.STILL_OUT)
  : path.resolve(".living-sakura/renders/lifelong");

const shots = [
  ["j1.png", 1, false],
  ["j8.png", 8, false],
  ["j12.png", 12, false],
  ["j48.png", 48, false],
  ["j96.png", 96, false],
  ["j200.png", 200, false],
  ["j12-structure.png", 12, true],
  ["j48-structure.png", 48, true],
  ["j96-structure.png", 96, true],
  ["j200-structure.png", 200, true],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [name, journals, structure] of shots) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const extra = structure ? "&structure=1" : "";
    const url = `http://127.0.0.1:3000/living-sakura?journals=${journals}&view=threeQuarter&clean=1&static=1${extra}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      const ready = page.locator('[data-capture-ready="true"]');
      if ((await ready.count()) > 0) {
        await ready
          .first()
          .waitFor({ state: "attached", timeout: 20_000 })
          .catch(() => {});
      }
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(out, name), fullPage: false });
      console.log("OK", name);
    } catch (error) {
      console.log("FAIL", name, String(error).slice(0, 240));
    }
    await page.close();
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
