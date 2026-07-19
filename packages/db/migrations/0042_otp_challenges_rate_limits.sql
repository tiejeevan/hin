CREATE TABLE `otp_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purpose` text NOT NULL,
	`user_id` integer,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`ip_address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `otp_challenges_user_purpose_created_idx` ON `otp_challenges` (`user_id`,`purpose`,`created_at`);
--> statement-breakpoint
CREATE INDEX `otp_challenges_email_purpose_idx` ON `otp_challenges` (`email`,`purpose`);
--> statement-breakpoint
CREATE INDEX `otp_challenges_expires_at_idx` ON `otp_challenges` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_ends_at` text NOT NULL
);
