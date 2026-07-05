ALTER TABLE `polls` ADD `question` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `polls` SET `question` = (SELECT `content` FROM `posts` WHERE `posts`.`id` = `polls`.`post_id`);--> statement-breakpoint
UPDATE `posts` SET `content` = '' WHERE `type` = 'poll' AND `id` IN (SELECT `post_id` FROM `polls`);
