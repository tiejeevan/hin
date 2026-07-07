CREATE TABLE `user_streaks` (
	`user_id` integer NOT NULL,
	`streak_type` text NOT NULL,
	`current` integer DEFAULT 0 NOT NULL,
	`longest` integer DEFAULT 0 NOT NULL,
	`last_activity_date` text,
	PRIMARY KEY(`user_id`, `streak_type`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`banner_url` text,
	`requires_opt_in` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`status`);
--> statement-breakpoint
CREATE INDEX `events_ends_at_idx` ON `events` (`ends_at`);
--> statement-breakpoint
CREATE TABLE `event_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`metric_key` text NOT NULL,
	`win_type` text NOT NULL,
	`config` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_rules_event_id_idx` ON `event_rules` (`event_id`);
--> statement-breakpoint
CREATE TABLE `event_participants` (
	`event_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_participants_score_idx` ON `event_participants` (`event_id`, `score` DESC);
--> statement-breakpoint
CREATE TABLE `event_wins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`prize_type` text NOT NULL,
	`prize_ref` text,
	`won_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_wins_event_user_idx` ON `event_wins` (`event_id`, `user_id`);
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('comment_created', 3, 1)
ON CONFLICT(`action_type`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('session_active', 1, 1)
ON CONFLICT(`action_type`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `badges` (`name`, `description`, `image_url`, `is_active`)
SELECT 'Week Regular', 'Open Hin 7 days in a row', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM `badges` WHERE `name` = 'Week Regular');
--> statement-breakpoint
INSERT INTO `badge_rules` (`badge_id`, `metric_key`, `operator`, `threshold`)
SELECT `id`, 'login_streak', '>=', 7 FROM `badges` WHERE `name` = 'Week Regular'
AND NOT EXISTS (
  SELECT 1 FROM `badge_rules` `br`
  INNER JOIN `badges` `b` ON `br`.`badge_id` = `b`.`id`
  WHERE `b`.`name` = 'Week Regular'
);
