-- Additive notifications evolution (backward compatible):
-- - entity_type: what entity_id refers to ('post' | 'message')
-- - comment_id: optional deep-link for comment / mention-in-comment
-- - index for unread queries by recipient
ALTER TABLE `notifications` ADD `entity_type` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `comment_id` integer;--> statement-breakpoint
UPDATE `notifications` SET `entity_type` = 'message' WHERE `type` = 'message';--> statement-breakpoint
UPDATE `notifications` SET `entity_type` = 'post' WHERE `type` IN ('like', 'comment', 'mention');--> statement-breakpoint
CREATE INDEX `notifications_user_id_read_idx` ON `notifications` (`user_id`,`read`);
