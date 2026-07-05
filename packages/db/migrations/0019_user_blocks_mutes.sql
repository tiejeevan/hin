CREATE TABLE `user_blocks` (
	`blocker_id` integer NOT NULL,
	`blocked_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_id_idx` ON `user_blocks` (`blocked_id`);
--> statement-breakpoint
CREATE INDEX `user_blocks_deleted_at_idx` ON `user_blocks` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `user_mutes` (
	`muter_id` integer NOT NULL,
	`muted_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`muter_id`, `muted_id`),
	FOREIGN KEY (`muter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`muted_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_mutes_muted_id_idx` ON `user_mutes` (`muted_id`);
--> statement-breakpoint
CREATE INDEX `user_mutes_deleted_at_idx` ON `user_mutes` (`deleted_at`);
