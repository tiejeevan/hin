CREATE TABLE `intro_walkthrough` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`completed_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
