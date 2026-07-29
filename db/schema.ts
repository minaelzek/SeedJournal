import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    authEmail: text("auth_email").notNull(),
    treeSeed: text("tree_seed").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("accounts_auth_email_unique").on(table.authEmail),
  ],
);

export const vaults = sqliteTable(
  "vaults",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    formatVersion: integer("format_version").notNull().default(1),
    kdf: text("kdf").notNull().default("PBKDF2-SHA-256"),
    iterations: integer("iterations").notNull(),
    salt: text("salt").notNull(),
    wrapAlgorithm: text("wrap_algorithm").notNull().default("AES-256-GCM"),
    wrapIv: text("wrap_iv").notNull(),
    wrappedKey: text("wrapped_key").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("vault_format_version_check", sql`${table.formatVersion} = 1`),
    check("vault_kdf_check", sql`${table.kdf} = 'PBKDF2-SHA-256'`),
    check(
      "vault_wrap_algorithm_check",
      sql`${table.wrapAlgorithm} = 'AES-256-GCM'`,
    ),
    check(
      "vault_iterations_check",
      sql`${table.iterations} >= 600000 AND ${table.iterations} <= 2000000`,
    ),
    check("vault_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    state: text("state", { enum: ["draft", "complete"] }).notNull(),
    envelopeVersion: integer("envelope_version").notNull().default(1),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
    revision: integer("revision").notNull(),
    clientCreatedAt: integer("client_created_at").notNull(),
    clientUpdatedAt: integer("client_updated_at").notNull(),
    completedAt: integer("completed_at"),
    localDay: text("local_day"),
    completionId: text("completion_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.id] }),
    index("entries_account_updated_idx").on(
      table.accountId,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex("entries_account_completion_unique").on(
      table.accountId,
      table.completionId,
    ),
    check("entry_envelope_version_check", sql`${table.envelopeVersion} = 1`),
    check("entry_revision_check", sql`${table.revision} >= 1`),
    check(
      "entry_state_check",
      sql`${table.state} IN ('draft', 'complete')`,
    ),
  ],
);

export const growthEvents = sqliteTable(
  "growth_events",
  {
    id: text("id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    entryId: text("entry_id"),
    sourceCompletionId: text("source_completion_id").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    localDate: text("local_date").notNull(),
    kind: text("kind", {
      enum: [
        "leaf",
        "memory_leaf",
        "memory_bud",
        "memory_blossom",
        "memory_luminous_blossom",
        "twig",
        "branch",
      ],
    }).notNull(),
    growthUnits: integer("growth_units").notNull(),
    seed: integer("seed").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.id] }),
    uniqueIndex("growth_account_sequence_unique").on(
      table.accountId,
      table.sequence,
    ),
    uniqueIndex("growth_completion_kind_unique").on(
      table.accountId,
      table.sourceCompletionId,
      table.kind,
    ),
    index("growth_account_entry_idx").on(table.accountId, table.entryId),
    check(
      "growth_kind_check",
      sql`${table.kind} IN ('leaf', 'memory_leaf', 'memory_bud', 'memory_blossom', 'memory_luminous_blossom', 'twig', 'branch')`,
    ),
    check(
      "growth_units_check",
      sql`${table.growthUnits} IN (0, 1, 2, 4, 6)`,
    ),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type Vault = typeof vaults.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type GrowthEvent = typeof growthEvents.$inferSelect;
