import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, test } from "@playwright/test";

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

const shots = resolve(dirname(fileURLToPath(import.meta.url)), "../../test-results");
mkdirSync(shots, { recursive: true });

const SISTER_ENTRY =
  "I keep saying yes to my sister because I am afraid she will think I do not care, but every time I do I feel smaller, and I think I have been calling that love.";
const ECHO_WORDS = ["smaller", "love", "sister", "afraid", "care"];

test.describe.configure({ timeout: 120_000 });

async function isVisible(locator) {
  return locator
    .count()
    .then((count) => (count > 0 ? locator.first().isVisible() : false));
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

async function withGarden(run, userSuffix, viewport = { width: 1280, height: 900 }) {
  const browser = await chromium.launch({
    headless: process.env.SEED_JOURNAL_E2E_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: {
      "oai-authenticated-user-id": `${authHeaders["oai-authenticated-user-id"]}-${userSuffix}`,
      "oai-authenticated-user-email": authHeaders["oai-authenticated-user-email"],
    },
    viewport,
  });
  const page = await context.newPage();
  try {
    await waitForPrivateSession(page);
    await run(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function beginReflection(page) {
  const begin = page.getByRole("button", { name: "Begin a reflection" });
  await begin.focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Journal entry").waitFor({ state: "visible", timeout: 15_000 });
}

async function settleJournal(page, text) {
  const body = page.getByLabel("Journal entry");
  await body.fill(text);
  await body.blur();
  const ask = page.locator("#sj-converse-ask, .sj-converse__ask").last();
  await ask.waitFor({ state: "visible", timeout: 20_000 });
  const reply = (await ask.innerText()).replace(/\s+/g, " ").trim();
  assert.ok(reply.length > 0, "garden reply was empty");
  return reply;
}

test("garden reply stays with the sister page and the tree grows", async () => {
  await withGarden(async (page) => {
    await beginReflection(page);
    const reply = await settleJournal(page, SISTER_ENTRY);
    assert.match(reply, /\?/);
    const echoed = ECHO_WORDS.filter((word) =>
      new RegExp(`\\b${word}\\b`, "i").test(reply),
    );
    assert.ok(
      echoed.length >= 2,
      `reply should echo at least two of ${ECHO_WORDS.join(", ")}, echoed [${echoed.join(", ")}]: ${reply}`,
    );
    assert.doesNotMatch(reply, /at stake|5%/i);
    await page.screenshot({
      path: resolve(shots, "living-conversation-reply.png"),
    });

    await page.getByRole("button", { name: "Leave with the tree" }).click();
    const back = page.getByRole("button", { name: "Return to your sakura" });
    await back.waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({
      path: resolve(shots, "living-conversation-grew.png"),
    });
    await back.click();
    await page.locator("main.sj-home").waitFor({ state: "visible", timeout: 15_000 });
    const closeMemory = page.getByRole("button", { name: "Close memory" });
    if (await closeMemory.isVisible().catch(() => false)) {
      await closeMemory.click();
    }

    // The shared local garden has already been tended, so the next page is not the first-open label.
    const again = page.getByRole("button", {
      name: /Begin a reflection|Write another page|Care for the sakura|Care for the tree|Continue reflection/,
    });
    await again.first().focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Journal entry").waitFor({ state: "visible", timeout: 15_000 });
    const thin = await settleJournal(page, "I feel anxious.");
    assert.doesNotMatch(thin, /\bkitchen\b/i);
    await page.screenshot({
      path: resolve(shots, "living-conversation-anxious.png"),
    });
  }, "sister");
});

test("a thin anxious line does not invent a kitchen", async () => {
  await withGarden(async (page) => {
    const begin = page.getByRole("button", {
      name: /Begin a reflection|Write another page|Care for the sakura|Care for the tree|Continue reflection/,
    });
    await begin.first().focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("Journal entry").waitFor({ state: "visible", timeout: 15_000 });
    const reply = await settleJournal(page, "I feel anxious.");
    assert.doesNotMatch(reply, /\bkitchen\b/i);
    await page.screenshot({
      path: resolve(shots, "living-conversation-anxious.png"),
    });
  }, "anxious");
});

test("a phone journal keeps the question and leave control on screen", async () => {
  await withGarden(
    async (page) => {
      await beginReflection(page);
      const body = page.getByLabel("Journal entry");
      await body.fill(
        "I felt sad and still grateful for the quiet in the kitchen.",
      );
      await body.blur();

      const question = page.locator("#sj-converse-ask, .sj-converse__ask").last();
      await question.waitFor({ state: "visible", timeout: 20_000 });
      const reply = (await question.innerText()).replace(/\s+/g, " ").trim();
      assert.match(reply, /\?/, `expected a visible question, saw: ${reply}`);

      const leave = page.getByRole("button", { name: "Leave with the tree" });
      await leave.waitFor({ state: "visible" });
      const box = await leave.boundingBox();
      const viewport = page.viewportSize();
      assert.ok(box, "Leave with the tree has no bounding box");
      assert.ok(viewport, "phone viewport is missing");
      const bottom = box.y + box.height;
      assert.ok(
        box.y >= -1 && bottom <= viewport.height + 1,
        `Leave with the tree is clipped off the viewport (top ${box.y}, bottom ${bottom}, viewport ${viewport.height})`,
      );

      await page.screenshot({
        path: resolve(shots, "living-conversation-phone.png"),
      });
    },
    "phone",
    { width: 390, height: 844 },
  );
});
