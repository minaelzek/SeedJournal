PRAGMA foreign_keys = ON;

CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `auth_email` text NOT NULL,
  `tree_seed` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `accounts_auth_email_unique` ON `accounts` (`auth_email`);

CREATE TABLE `vaults` (
  `account_id` text PRIMARY KEY NOT NULL,
  `format_version` integer DEFAULT 1 NOT NULL,
  `kdf` text DEFAULT 'PBKDF2-SHA-256' NOT NULL,
  `iterations` integer NOT NULL,
  `salt` text NOT NULL,
  `wrap_algorithm` text DEFAULT 'AES-256-GCM' NOT NULL,
  `wrap_iv` text NOT NULL,
  `wrapped_key` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `vault_format_version_check` CHECK (`format_version` = 1),
  CONSTRAINT `vault_kdf_check` CHECK (`kdf` = 'PBKDF2-SHA-256'),
  CONSTRAINT `vault_wrap_algorithm_check` CHECK (`wrap_algorithm` = 'AES-256-GCM'),
  CONSTRAINT `vault_iterations_check` CHECK (`iterations` >= 600000 AND `iterations` <= 2000000),
  CONSTRAINT `vault_revision_check` CHECK (`revision` >= 1)
);

CREATE TABLE `entries` (
  `id` text NOT NULL,
  `account_id` text NOT NULL,
  `state` text NOT NULL,
  `envelope_version` integer DEFAULT 1 NOT NULL,
  `iv` text NOT NULL,
  `ciphertext` text NOT NULL,
  `revision` integer NOT NULL,
  `client_created_at` integer NOT NULL,
  `client_updated_at` integer NOT NULL,
  `completed_at` integer,
  `local_day` text,
  `completion_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  PRIMARY KEY (`account_id`, `id`),
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `entry_envelope_version_check` CHECK (`envelope_version` = 1),
  CONSTRAINT `entry_revision_check` CHECK (`revision` >= 1),
  CONSTRAINT `entry_state_check` CHECK (`state` IN ('draft', 'complete'))
);
CREATE INDEX `entries_account_updated_idx` ON `entries` (`account_id`, `updated_at`, `id`);
CREATE UNIQUE INDEX `entries_account_completion_unique` ON `entries` (`account_id`, `completion_id`);

CREATE TABLE `growth_events` (
  `id` text NOT NULL,
  `account_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `entry_id` text,
  `source_completion_id` text NOT NULL,
  `occurred_at` integer NOT NULL,
  `local_date` text NOT NULL,
  `kind` text NOT NULL,
  `growth_units` integer NOT NULL,
  `seed` integer NOT NULL,
  PRIMARY KEY (`account_id`, `id`),
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `growth_kind_check` CHECK (`kind` IN ('leaf', 'memory_leaf', 'memory_bud', 'memory_blossom', 'memory_luminous_blossom', 'twig', 'branch')),
  CONSTRAINT `growth_units_check` CHECK (`growth_units` IN (0, 1, 2, 4, 6))
);
CREATE UNIQUE INDEX `growth_account_sequence_unique` ON `growth_events` (`account_id`, `sequence`);
CREATE UNIQUE INDEX `growth_completion_kind_unique` ON `growth_events` (`account_id`, `source_completion_id`, `kind`);
CREATE INDEX `growth_account_entry_idx` ON `growth_events` (`account_id`, `entry_id`);
