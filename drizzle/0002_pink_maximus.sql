CREATE TABLE `account_data_keys` (
	`account_id` text PRIMARY KEY NOT NULL,
	`wrap_algorithm` text DEFAULT 'AES-256-GCM' NOT NULL,
	`wrap_iv` text NOT NULL,
	`wrapped_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "account_data_keys_wrap_algorithm_check" CHECK("account_data_keys"."wrap_algorithm" = 'AES-256-GCM')
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_account_idx` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email` text,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`refresh_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "social_accounts_provider_check" CHECK("social_accounts"."provider" IN ('google', 'apple')),
	CONSTRAINT "social_accounts_email_verified_check" CHECK("social_accounts"."email_verified" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_accounts_provider_subject_unique` ON `social_accounts` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE INDEX `social_accounts_account_idx` ON `social_accounts` (`account_id`);--> statement-breakpoint
CREATE INDEX `accounts_email_idx` ON `accounts` (`email`);