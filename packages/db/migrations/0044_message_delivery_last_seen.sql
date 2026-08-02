ALTER TABLE `users` ADD `last_seen_at` text;
--> statement-breakpoint
ALTER TABLE `messages` ADD `delivered_at` text;
--> statement-breakpoint
ALTER TABLE `messages` ADD `read_at` text;
