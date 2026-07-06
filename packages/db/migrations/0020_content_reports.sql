CREATE TABLE `content_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`);
--> statement-breakpoint
CREATE INDEX `content_reports_target_idx` ON `content_reports` (`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `content_reports_reporter_target_idx` ON `content_reports` (`reporter_id`,`target_type`,`target_id`);
