ALTER TABLE `level_config` ADD `max_equipped_badges` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `level_config` SET `max_equipped_badges` = 0 WHERE `level` = 1;
--> statement-breakpoint
UPDATE `level_config` SET `max_equipped_badges` = 1 WHERE `level` = 2;
--> statement-breakpoint
UPDATE `level_config` SET `max_equipped_badges` = 2 WHERE `level` = 3;
--> statement-breakpoint
UPDATE `level_config` SET `max_equipped_badges` = 3 WHERE `level` = 4;
--> statement-breakpoint
UPDATE `level_config` SET `max_equipped_badges` = 5 WHERE `level` = 5;
--> statement-breakpoint
CREATE TABLE `user_equipped_badges` (
	`user_id` integer NOT NULL,
	`badge_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `badge_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_equipped_badges_user_id_idx` ON `user_equipped_badges` (`user_id`);
