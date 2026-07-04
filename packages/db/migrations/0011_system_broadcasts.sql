CREATE TABLE `system_broadcasts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_id` integer NOT NULL,
	`content` text NOT NULL,
	`delivery` text NOT NULL,
	`notifications_created` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `system_broadcasts_sender_id_idx` ON `system_broadcasts` (`sender_id`);--> statement-breakpoint
CREATE INDEX `system_broadcasts_created_at_idx` ON `system_broadcasts` (`created_at`);
