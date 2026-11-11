CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_subject_id` text NOT NULL,
	`email` text,
	`display_name` text,
	`tree_seed` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_auth_subject_id_unique` ON `accounts` (`auth_subject_id`);--> statement-breakpoint
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
	PRIMARY KEY(`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entry_envelope_version_check" CHECK("entries"."envelope_version" = 1),
	CONSTRAINT "entry_revision_check" CHECK("entries"."revision" >= 1),
	CONSTRAINT "entry_state_check" CHECK("entries"."state" IN ('draft', 'complete'))
);
--> statement-breakpoint
CREATE INDEX `entries_account_updated_idx` ON `entries` (`account_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_account_completion_unique` ON `entries` (`account_id`,`completion_id`);--> statement-breakpoint
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
	PRIMARY KEY(`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "growth_kind_check" CHECK("growth_events"."kind" IN ('leaf', 'memory_leaf', 'memory_bud', 'memory_blossom', 'memory_luminous_blossom', 'twig', 'branch')),
	CONSTRAINT "growth_units_check" CHECK("growth_events"."growth_units" IN (0, 1, 2, 4, 6))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_account_sequence_unique` ON `growth_events` (`account_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `growth_completion_kind_unique` ON `growth_events` (`account_id`,`source_completion_id`,`kind`);--> statement-breakpoint
CREATE INDEX `growth_account_entry_idx` ON `growth_events` (`account_id`,`entry_id`);--> statement-breakpoint
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
	CONSTRAINT "vault_format_version_check" CHECK("vaults"."format_version" = 1),
	CONSTRAINT "vault_kdf_check" CHECK("vaults"."kdf" = 'PBKDF2-SHA-256'),
	CONSTRAINT "vault_wrap_algorithm_check" CHECK("vaults"."wrap_algorithm" = 'AES-256-GCM'),
	CONSTRAINT "vault_iterations_check" CHECK("vaults"."iterations" >= 600000 AND "vaults"."iterations" <= 2000000),
	CONSTRAINT "vault_revision_check" CHECK("vaults"."revision" >= 1)
);
