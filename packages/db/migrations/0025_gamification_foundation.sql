CREATE TABLE `user_gamification` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_stat_counters` (
	`user_id` integer NOT NULL,
	`metric_key` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `metric_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `badges_is_active_idx` ON `badges` (`is_active`);
--> statement-breakpoint
CREATE TABLE `badge_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`badge_id` integer NOT NULL,
	`metric_key` text NOT NULL,
	`operator` text DEFAULT '>=' NOT NULL,
	`threshold` integer NOT NULL,
	FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `badge_rules_badge_id_idx` ON `badge_rules` (`badge_id`);
--> statement-breakpoint
CREATE INDEX `badge_rules_metric_key_idx` ON `badge_rules` (`metric_key`);
--> statement-breakpoint
CREATE TABLE `point_rules` (
	`action_type` text PRIMARY KEY NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `level_config` (
	`level` integer PRIMARY KEY NOT NULL,
	`min_points` integer NOT NULL
);
