ALTER TABLE `users` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `users_deleted_at_idx` ON `users` (`deleted_at`);