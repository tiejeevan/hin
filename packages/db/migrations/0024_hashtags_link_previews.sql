CREATE TABLE `link_previews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url_hash` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`image_url` text,
	`site_name` text,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`fetch_failed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_previews_url_hash_unique` ON `link_previews` (`url_hash`);
--> statement-breakpoint
ALTER TABLE `posts` ADD `link_preview_id` integer REFERENCES `link_previews`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `hashtags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hashtags_tag_unique` ON `hashtags` (`tag`);
--> statement-breakpoint
CREATE TABLE `post_hashtags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`hashtag_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hashtag_id`) REFERENCES `hashtags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_hashtags_post_id_idx` ON `post_hashtags` (`post_id`);
--> statement-breakpoint
CREATE INDEX `post_hashtags_hashtag_id_idx` ON `post_hashtags` (`hashtag_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_hashtags_unique` ON `post_hashtags` (`post_id`,`hashtag_id`);
