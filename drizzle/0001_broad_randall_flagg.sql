ALTER TABLE `accounts`
ADD COLUMN `tree_algorithm_version` integer DEFAULT 2 NOT NULL
CHECK (`tree_algorithm_version` IN (1, 2));
--> statement-breakpoint
UPDATE `accounts`
SET `tree_algorithm_version` = 2;
