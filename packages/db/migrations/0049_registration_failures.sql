CREATE TABLE `registration_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`failure_reason` text NOT NULL,
	`failure_detail` text,
	`ip_address` text,
	`session_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `registration_failures_created_at_idx` ON `registration_failures` (`created_at`);
--> statement-breakpoint
CREATE INDEX `registration_failures_email_idx` ON `registration_failures` (`email`);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `original_username` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `original_email` text;
