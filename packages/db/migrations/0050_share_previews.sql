CREATE TABLE `share_previews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_type` text NOT NULL,
	`resource_key` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`image_url` text NOT NULL,
	`site_name` text DEFAULT 'Hin' NOT NULL,
	`robots` text DEFAULT 'index,follow' NOT NULL,
	`is_public` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_previews_resource_unique` ON `share_previews` (`resource_type`,`resource_key`);
--> statement-breakpoint
CREATE INDEX `share_previews_is_public_idx` ON `share_previews` (`is_public`);
