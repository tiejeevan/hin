-- Separate gamification notifications from social notifications.
ALTER TABLE `notifications` ADD `category` text DEFAULT 'social' NOT NULL;--> statement-breakpoint
UPDATE `notifications` SET `category` = 'gamification' WHERE `type` IN ('badge_award', 'level_up');--> statement-breakpoint
UPDATE `notifications` SET `category` = 'gamification', `type` = 'event_win'
WHERE `type` = 'system'
  AND `sender_id` = `user_id`
  AND `entity_id` IN (SELECT `id` FROM `events`);--> statement-breakpoint
CREATE INDEX `notifications_user_id_category_read_idx` ON `notifications` (`user_id`, `category`, `read`);
