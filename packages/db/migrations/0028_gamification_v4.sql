CREATE TABLE `points_ledger_archive` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`delta` integer NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	`archived_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `points_ledger_archive_user_id_idx` ON `points_ledger_archive` (`user_id`);
--> statement-breakpoint
CREATE INDEX `points_ledger_archive_created_at_idx` ON `points_ledger_archive` (`created_at`);
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('session_tick', 0, 1)
ON CONFLICT(`action_type`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('like_given', 1, 1)
ON CONFLICT(`action_type`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `point_rules` (`action_type`, `points`, `is_active`) VALUES ('like_removed', 0, 1)
ON CONFLICT(`action_type`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `badges` (`name`, `description`, `image_url`, `is_active`)
SELECT 'Warming Up', 'Spend 5 active minutes on Hin', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM `badges` WHERE `name` = 'Warming Up');
--> statement-breakpoint
INSERT INTO `badge_rules` (`badge_id`, `metric_key`, `operator`, `threshold`)
SELECT `id`, 'total_session_minutes', '>=', 5 FROM `badges` WHERE `name` = 'Warming Up'
AND NOT EXISTS (
  SELECT 1 FROM `badge_rules` `br`
  INNER JOIN `badges` `b` ON `br`.`badge_id` = `b`.`id`
  WHERE `b`.`name` = 'Warming Up'
);
