ALTER TABLE `users` ADD `google_id` text;
CREATE UNIQUE INDEX `users_google_id_idx` ON `users` (`google_id`);
