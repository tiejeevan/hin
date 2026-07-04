CREATE TABLE `post_edit_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`previous_content` text NOT NULL,
	`previous_media_url` text,
	`edited_by` integer NOT NULL,
	`edited_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_edit_history_post_id_idx` ON `post_edit_history` (`post_id`);--> statement-breakpoint
CREATE INDEX `post_edit_history_edited_at_idx` ON `post_edit_history` (`edited_at`);