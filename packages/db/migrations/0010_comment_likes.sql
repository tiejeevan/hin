CREATE TABLE `comment_likes` (
	`user_id` integer NOT NULL,
	`comment_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `comment_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `comment_likes_comment_id_idx` ON `comment_likes` (`comment_id`);--> statement-breakpoint
CREATE INDEX `comment_likes_deleted_at_idx` ON `comment_likes` (`deleted_at`);
