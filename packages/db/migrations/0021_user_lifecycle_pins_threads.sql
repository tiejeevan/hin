ALTER TABLE `users` ADD `deletion_source` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `pinned_at` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `thread_root_id` integer REFERENCES `posts`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `posts` ADD `parent_post_id` integer REFERENCES `posts`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `posts_user_pinned_idx` ON `posts` (`user_id`,`pinned_at`);
--> statement-breakpoint
CREATE INDEX `posts_thread_root_id_idx` ON `posts` (`thread_root_id`);
--> statement-breakpoint
CREATE INDEX `posts_parent_post_id_idx` ON `posts` (`parent_post_id`);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `system_settings` (`key`, `value`) VALUES ('max_pinned_posts_per_user', '1');
