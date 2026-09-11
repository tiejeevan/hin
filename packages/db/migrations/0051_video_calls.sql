INSERT OR IGNORE INTO `system_settings` (`key`, `value`) VALUES ('video_calls_enabled', 'false');

CREATE TABLE `video_call_allowlist` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`granted_by_admin_id` integer NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `video_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller_id` integer NOT NULL,
	`callee_id` integer NOT NULL,
	`meeting_id` text NOT NULL,
	`caller_participant_id` text NOT NULL,
	`callee_participant_id` text NOT NULL,
	`status` text DEFAULT 'ringing' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`caller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`callee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `video_calls_caller_status_idx` ON `video_calls` (`caller_id`,`status`);
CREATE INDEX `video_calls_callee_status_idx` ON `video_calls` (`callee_id`,`status`);
