CREATE TABLE `user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`notify_likes` integer DEFAULT 1 NOT NULL,
	`notify_comments` integer DEFAULT 1 NOT NULL,
	`notify_mentions` integer DEFAULT 1 NOT NULL,
	`notify_dms` integer DEFAULT 1 NOT NULL,
	`notify_system` integer DEFAULT 1 NOT NULL,
	`mute_all_toasts` integer DEFAULT 0 NOT NULL,
	`chat_icon_mode` text DEFAULT 'global' NOT NULL,
	`chat_icon_pages` text DEFAULT '[]' NOT NULL,
	`extensions_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `user_settings` (`user_id`)
SELECT `id` FROM `users`;
