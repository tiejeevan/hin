ALTER TABLE `posts` ADD `repost_of_post_id` integer REFERENCES `posts`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `posts` ADD `is_quote` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_repost_of_post_id_idx` ON `posts` (`repost_of_post_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_unique_silent_repost_idx` ON `posts` (`user_id`, `repost_of_post_id`) WHERE `is_quote` = 0 AND `deleted_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `notify_reposts` integer DEFAULT 1 NOT NULL;
