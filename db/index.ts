import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const workerEnv = env as unknown as { DB?: D1Database };
  if (!workerEnv.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Attach the seedjournal database in wrangler.toml before using the database."
    );
  }

  return drizzle(workerEnv.DB, { schema });
}

export function getD1() {
  const workerEnv = env as unknown as { DB?: D1Database };
  if (!workerEnv.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return workerEnv.DB;
}
