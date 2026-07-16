CREATE TABLE `item_bookmarks` (
	`user_id` integer NOT NULL,
	`olabid_item_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `olabid_item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`olabid_item_id`) REFERENCES `olabid_items`(`external_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_bookmarks_olabid_item_id_idx` ON `item_bookmarks` (`olabid_item_id`);
--> statement-breakpoint
CREATE INDEX `item_bookmarks_deleted_at_idx` ON `item_bookmarks` (`deleted_at`);
