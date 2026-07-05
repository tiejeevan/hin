ALTER TABLE `users` ADD `is_private` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `users_is_private_idx` ON `users` (`is_private`);
--> statement-breakpoint
CREATE TABLE `user_follows` (
	`follower_id` integer NOT NULL,
	`following_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`follower_id`, `following_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_follows_following_id_idx` ON `user_follows` (`following_id`);
--> statement-breakpoint
CREATE INDEX `user_follows_deleted_at_idx` ON `user_follows` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `follow_requests` (
	`requester_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`requester_id`, `target_id`),
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follow_requests_target_id_idx` ON `follow_requests` (`target_id`);
--> statement-breakpoint
CREATE INDEX `follow_requests_deleted_at_idx` ON `follow_requests` (`deleted_at`);
