DELETE FROM `sessions`;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `email_verified` integer DEFAULT 0 NOT NULL CHECK (`email_verified` IN (0, 1));
--> statement-breakpoint
UPDATE `accounts`
SET `email_verified` = 1
WHERE `email` IS NOT NULL
  AND length(trim(`email`)) > 0
  AND EXISTS (
    SELECT 1
    FROM `social_accounts`
    WHERE `social_accounts`.`account_id` = `accounts`.`id`
      AND `social_accounts`.`email_verified` = 1
      AND lower(`social_accounts`.`email`) = lower(`accounts`.`email`)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_verified_email_unique` ON `accounts` (`email`) WHERE `accounts`.`email_verified` = 1;
