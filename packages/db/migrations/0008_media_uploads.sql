ALTER TABLE `posts` ADD `media_urls` text;--> statement-breakpoint
UPDATE `posts` SET `media_urls` = json_array(`media_url`) WHERE `media_url` IS NOT NULL AND `media_url` != '';--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `media_url`;--> statement-breakpoint
ALTER TABLE `post_edit_history` ADD `previous_media_urls` text;--> statement-breakpoint
UPDATE `post_edit_history` SET `previous_media_urls` = json_array(`previous_media_url`) WHERE `previous_media_url` IS NOT NULL AND `previous_media_url` != '';--> statement-breakpoint
ALTER TABLE `post_edit_history` DROP COLUMN `previous_media_url`;--> statement-breakpoint
CREATE TABLE `media_uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`url` text NOT NULL,
	`type` text NOT NULL,
	`post_id` integer,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `media_uploads_r2_key_unique` ON `media_uploads` (`r2_key`);--> statement-breakpoint
CREATE INDEX `media_uploads_user_id_idx` ON `media_uploads` (`user_id`);--> statement-breakpoint
CREATE INDEX `media_uploads_post_id_idx` ON `media_uploads` (`post_id`);--> statement-breakpoint
CREATE INDEX `media_uploads_type_idx` ON `media_uploads` (`type`);
