ALTER TABLE `likes` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `likes_deleted_at_idx` ON `likes` (`deleted_at`);