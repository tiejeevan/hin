CREATE TABLE `post_bookmarks` (
	`user_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `post_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_bookmarks_post_id_idx` ON `post_bookmarks` (`post_id`);
--> statement-breakpoint
CREATE INDEX `post_bookmarks_deleted_at_idx` ON `post_bookmarks` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `post_shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`post_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_shares_post_id_idx` ON `post_shares` (`post_id`);
--> statement-breakpoint
CREATE INDEX `post_shares_user_id_idx` ON `post_shares` (`user_id`);
