import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const confirmation = process.env.SEED_JOURNAL_RESET_CONFIRMATION;
if (confirmation !== "RESET") {
  console.error(
    "Refusing to reset the local D1 database. Set SEED_JOURNAL_RESET_CONFIRMATION=RESET to continue.",
  );
  process.exit(1);
}

const configPath = resolve("wrangler.toml");
const persistPath = resolve(".wrangler/state");
try {
  await access(configPath);
} catch {
  console.error(
    "Local D1 reset requires wrangler.toml. Create a local config before resetting.",
  );
  process.exit(1);
}

const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";

function runWrangler(args) {
  const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : wrangler;
  const commandArgs =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          [wrangler, ...args].map(quoteWindowsArgument).join(" "),
        ]
      : args;
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "inherit", "inherit"],
    });

    child.once("error", rejectProcess);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      rejectProcess(
        new Error(
          `Wrangler exited with ${signal ? `signal ${signal}` : `code ${code}`}.`,
        ),
      );
    });
  });
}

function quoteWindowsArgument(value) {
  if (!/[\s&|<>^]/u.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

const resetSql = [
  "DROP TABLE IF EXISTS growth_events",
  "DROP TABLE IF EXISTS entries",
  "DROP TABLE IF EXISTS vaults",
  "DROP TABLE IF EXISTS account_data_keys",
  "DROP TABLE IF EXISTS sessions",
  "DROP TABLE IF EXISTS social_accounts",
  "DROP TABLE IF EXISTS accounts",
  "DROP TABLE IF EXISTS d1_migrations",
].join("; ");
const resetSqlPath = resolve(".wrangler/reset-local-db.sql");

try {
  await mkdir(resolve(".wrangler"), { recursive: true });
  await writeFile(resetSqlPath, `${resetSql};\n`, "utf8");
  await runWrangler([
    "d1",
    "execute",
    "seedjournal",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    persistPath,
    "--file",
    resetSqlPath,
    "--yes",
  ]);
  await runWrangler([
    "d1",
    "migrations",
    "apply",
    "seedjournal",
    "--local",
    "--config",
    configPath,
    "--persist-to",
    persistPath,
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await rm(resetSqlPath, { force: true });
}
