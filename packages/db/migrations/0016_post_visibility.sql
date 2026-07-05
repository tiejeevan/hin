ALTER TABLE `posts` ADD `visibility` text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
CREATE INDEX `posts_visibility_idx` ON `posts` (`visibility`);
