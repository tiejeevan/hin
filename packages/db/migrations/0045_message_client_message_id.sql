ALTER TABLE `messages` ADD `client_message_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_sender_client_message_id_idx` ON `messages` (`sender_id`, `client_message_id`);
