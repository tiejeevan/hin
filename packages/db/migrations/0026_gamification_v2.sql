CREATE TABLE `user_badges` (
	`user_id` integer NOT NULL,
	`badge_id` integer NOT NULL,
	`earned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `badge_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_badges_badge_id_idx` ON `user_badges` (`badge_id`);
--> statement-breakpoint
CREATE TABLE `points_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`delta` integer NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `points_ledger_user_id_idx` ON `points_ledger` (`user_id`);
--> statement-breakpoint
CREATE INDEX `points_ledger_created_at_idx` ON `points_ledger` (`created_at`);
--> statement-breakpoint
INSERT INTO `level_config` (`level`, `min_points`) VALUES (1, 0);
--> statement-breakpoint
INSERT INTO `level_config` (`level`, `min_points`) VALUES (2, 500);
--> statement-breakpoint
INSERT INTO `level_config` (`level`, `min_points`) VALUES (3, 1500);
--> statement-breakpoint
INSERT INTO `level_config` (`level`, `min_points`) VALUES (4, 3000);
--> statement-breakpoint
INSERT INTO `level_config` (`level`, `min_points`) VALUES (5, 5000);
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('post_created', 10, 1);
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('post_shared', 5, 1);
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('user_followed', 10, 1);
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('post_liked', 2, 1);
--> statement-breakpoint
INSERT INTO `badges` (`id`, `name`, `description`, `image_url`, `is_active`) VALUES (1, 'Getting Started', 'Publish 10 posts', NULL, 1);
--> statement-breakpoint
INSERT INTO `badges` (`id`, `name`, `description`, `image_url`, `is_active`) VALUES (2, 'Rising Voice', 'Reach 10 followers', NULL, 1);
--> statement-breakpoint
INSERT INTO `badges` (`id`, `name`, `description`, `image_url`, `is_active`) VALUES (3, 'Crowd Favorite', 'Get 10 likes on a single post', NULL, 1);
--> statement-breakpoint
INSERT INTO `badge_rules` (`badge_id`, `metric_key`, `operator`, `threshold`) VALUES (1, 'total_posts', '>=', 10);
--> statement-breakpoint
INSERT INTO `badge_rules` (`badge_id`, `metric_key`, `operator`, `threshold`) VALUES (2, 'follower_count', '>=', 10);
--> statement-breakpoint
INSERT INTO `badge_rules` (`badge_id`, `metric_key`, `operator`, `threshold`) VALUES (3, 'max_likes_single_post', '>=', 10);
