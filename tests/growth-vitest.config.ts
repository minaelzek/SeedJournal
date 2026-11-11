import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "tests/growth-experience.test.tsx",
      "tests/growth-care-rhythm.test.ts",
      "tests/living-development.test.ts",
      "tests/journal-recovery.test.tsx",
      "tests/voice-capture.test.tsx",
      "tests/illustration-presentation.test.ts",
      "tests/on-this-day.test.ts",
      "tests/care-reminder.test.ts",
      "tests/overnight-life.test.ts",
      "tests/attachment-loop.test.ts",
      "tests/garden-living-fallback.test.ts",
      "tests/first-open-arrival.test.ts",
    ],
  },
});
