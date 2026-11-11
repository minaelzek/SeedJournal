const { chromium } = require("playwright");
const path = require("path");
const out = process.env.STILL_OUT;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const shots = [
    ["lab-structure-192.png", "http://127.0.0.1:3000/living-sakura?journals=192&view=threeQuarter&clean=1&static=1&structure=1", 1280, 800],
    ["lab-structure-48.png", "http://127.0.0.1:3000/living-sakura?journals=48&view=threeQuarter&clean=1&static=1&structure=1", 1280, 800],
    ["lab-structure-12.png", "http://127.0.0.1:3000/living-sakura?journals=12&view=threeQuarter&clean=1&static=1&structure=1", 1280, 800],
    ["lab-structure-375.png", "http://127.0.0.1:3000/living-sakura?journals=192&view=threeQuarter&clean=1&static=1&structure=1", 375, 812],
    ["lab-mature-desktop.png", "http://127.0.0.1:3000/living-sakura?journals=192&view=threeQuarter&clean=1&static=1", 1280, 800],
    ["lab-mid-desktop.png", "http://127.0.0.1:3000/living-sakura?journals=48&view=threeQuarter&clean=1&static=1", 1280, 800],
    ["lab-youth-desktop.png", "http://127.0.0.1:3000/living-sakura?journals=6&view=threeQuarter&clean=1&static=1", 1280, 800],
    ["lab-mid-375.png", "http://127.0.0.1:3000/living-sakura?journals=48&view=threeQuarter&clean=1&static=1", 375, 812],
    ["lab-youth-375.png", "http://127.0.0.1:3000/living-sakura?journals=6&view=threeQuarter&clean=1&static=1", 375, 812],
    ["welcome-desktop.png", "http://127.0.0.1:3000/welcome", 1280, 800],
    ["welcome-375.png", "http://127.0.0.1:3000/welcome", 375, 812],
    ["home-desktop.png", "http://127.0.0.1:3000/", 1280, 800],
    ["home-375.png", "http://127.0.0.1:3000/", 375, 812],
  ];
  for (const [name, url, w, h] of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(2500);
      const ready = page.locator('[data-capture-ready="true"]');
      if (await ready.count()) {
        await ready.first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
      await page.screenshot({ path: path.join(out, name), fullPage: false });
      console.log("OK", name);
    } catch (e) {
      console.log("FAIL", name, String(e).slice(0, 220));
    }
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
