import { existsSync } from "node:fs";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// Used only when wrangler.toml is absent. Binding name matches the Worker code.
const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [
    {
      binding: "DB",
      database_name: "seedjournal",
      database_id: "7dec0e1e-ac67-46ac-9a6a-ad1ab91fae68",
    },
  ],
};

// Prefer the local Wrangler file when it exists. Passing the same compatibility
// flags and bindings inline as well makes the Cloudflare Vite plugin concatenate
// duplicate config entries. The inline fallback keeps clean Sites/CI checkouts
// self-contained when no local Wrangler file is present.
const cloudflareWorkerConfig = existsSync("wrangler.toml")
  ? { configPath: "./wrangler.toml" }
  : { config: localBindingConfig };

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        ...cloudflareWorkerConfig,
      }),
    ],
  };
});
