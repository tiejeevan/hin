CREATE TABLE `olabid_items` (
	`external_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`condition` text,
	`current_bid_amount` integer,
	`retail_price` integer,
	`image_url` text,
	`snapshot_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`olabid_item_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`parent_id` integer,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`olabid_item_id`) REFERENCES `olabid_items`(`external_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `item_comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_comments_olabid_item_id_idx` ON `item_comments` (`olabid_item_id`);
--> statement-breakpoint
CREATE INDEX `item_comments_parent_id_idx` ON `item_comments` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `item_comments_user_id_idx` ON `item_comments` (`user_id`);
--> statement-breakpoint
CREATE INDEX `item_comments_deleted_at_idx` ON `item_comments` (`deleted_at`);
--> statement-breakpoint
CREATE TABLE `item_comment_likes` (
	`user_id` integer NOT NULL,
	`comment_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `comment_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `item_comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_comment_likes_comment_id_idx` ON `item_comment_likes` (`comment_id`);
--> statement-breakpoint
CREATE INDEX `item_comment_likes_deleted_at_idx` ON `item_comment_likes` (`deleted_at`);
--> statement-breakpoint
ALTER TABLE `messages` ADD `link_preview_id` integer REFERENCES `link_previews`(`id`) ON DELETE set null;
