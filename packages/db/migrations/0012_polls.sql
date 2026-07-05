ALTER TABLE `posts` ADD `type` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
UPDATE `posts` SET `type` = 'text' WHERE `type` IS NULL;--> statement-breakpoint
CREATE INDEX `posts_type_idx` ON `posts` (`type`);--> statement-breakpoint
CREATE TABLE `polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`ends_at` text,
	`max_selections` integer DEFAULT 1 NOT NULL,
	`allow_vote_change` integer DEFAULT 1 NOT NULL,
	`is_anonymous` integer DEFAULT 0 NOT NULL,
	`results_visibility` text DEFAULT 'always' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`total_votes` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `polls_post_id_unique` ON `polls` (`post_id`);--> statement-breakpoint
CREATE INDEX `polls_post_id_idx` ON `polls` (`post_id`);--> statement-breakpoint
CREATE INDEX `polls_status_idx` ON `polls` (`status`);--> statement-breakpoint
CREATE INDEX `polls_ends_at_idx` ON `polls` (`ends_at`);--> statement-breakpoint
CREATE TABLE `poll_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `poll_options_poll_id_idx` ON `poll_options` (`poll_id`);--> statement-breakpoint
CREATE TABLE `poll_votes` (
	`user_id` integer NOT NULL,
	`option_id` integer NOT NULL,
	`poll_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `option_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `poll_options`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `poll_votes_poll_id_idx` ON `poll_votes` (`poll_id`);--> statement-breakpoint
CREATE INDEX `poll_votes_user_poll_idx` ON `poll_votes` (`user_id`, `poll_id`);--> statement-breakpoint
CREATE INDEX `poll_votes_deleted_at_idx` ON `poll_votes` (`deleted_at`);
