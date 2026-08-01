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
      "tests/journal-recovery.test.tsx",
      "tests/illustration-presentation.test.ts",
    ],
  },
});
