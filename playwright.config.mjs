import { defineConfig } from "playwright/test";

const baseURL =
  process.env.SEED_JOURNAL_E2E_BASE_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /(seed-journal-smoke|sakura-img2threejs|living-sakura-still-pack|living-conversation)\.mjs$/,
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    actionTimeout: 8_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    // The production build closes the local garden and ignores spoofed
    // login headers. The smoke flow signs in with "Continue in this garden",
    // which only exists while this dev server is running.
    command: "npm run dev -- --port 8787",
    url: `${baseURL}/welcome`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
