ALTER TABLE `users` ADD `moderator_status` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `account_moderation_status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `account_moderation_reason` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `account_moderation_until` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `account_moderation_set_by` integer REFERENCES users(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `users` ADD `account_moderation_set_at` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderation_action` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderation_reason` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderated_by` integer REFERENCES users(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderated_at` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `comments_locked` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `comments` ADD `moderation_action` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD `moderation_reason` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD `moderated_by` integer REFERENCES users(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `comments` ADD `moderated_at` text;
--> statement-breakpoint
ALTER TABLE `content_reports` ADD `resolution_reason` text;
--> statement-breakpoint
ALTER TABLE `content_reports` ADD `escalated_at` text;
--> statement-breakpoint
ALTER TABLE `content_reports` ADD `escalated_by` integer REFERENCES users(id) ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);
--> statement-breakpoint
CREATE INDEX `permissions_category_idx` ON `permissions` (`category`);
--> statement-breakpoint
CREATE TABLE `moderator_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	`granted_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderator_permissions_user_permission_unique` ON `moderator_permissions` (`user_id`,`permission_id`);
--> statement-breakpoint
CREATE INDEX `moderator_permissions_user_id_idx` ON `moderator_permissions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `moderation_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer,
	`reason` text,
	`metadata` text,
	`before_state` text,
	`after_state` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `moderation_audit_logs_actor_id_idx` ON `moderation_audit_logs` (`actor_id`);
--> statement-breakpoint
CREATE INDEX `moderation_audit_logs_action_idx` ON `moderation_audit_logs` (`action`);
--> statement-breakpoint
CREATE INDEX `moderation_audit_logs_target_idx` ON `moderation_audit_logs` (`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `moderation_audit_logs_created_at_idx` ON `moderation_audit_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `posts_moderation_action_idx` ON `posts` (`moderation_action`);
--> statement-breakpoint
CREATE INDEX `comments_moderation_action_idx` ON `comments` (`moderation_action`);
--> statement-breakpoint
INSERT INTO `permissions` (`key`, `name`, `description`, `category`) VALUES
('post.view', 'View Posts', 'View posts in moderation context', 'Posts'),
('post.review', 'Review Posts', 'Review posts awaiting moderation', 'Posts'),
('post.hide', 'Hide Posts', 'Hide posts from public view', 'Posts'),
('post.unhide', 'Unhide Posts', 'Restore hidden posts', 'Posts'),
('post.remove', 'Remove Posts', 'Remove posts from the platform', 'Posts'),
('post.restore', 'Restore Posts', 'Restore removed posts', 'Posts'),
('post.feature', 'Feature Posts', 'Feature posts (reserved)', 'Posts'),
('post.unfeature', 'Unfeature Posts', 'Remove featured status (reserved)', 'Posts'),
('comment.view', 'View Comments', 'View comments in moderation context', 'Comments'),
('comment.review', 'Review Comments', 'Review comments awaiting moderation', 'Comments'),
('comment.hide', 'Hide Comments', 'Hide comments from public view', 'Comments'),
('comment.unhide', 'Unhide Comments', 'Restore hidden comments', 'Comments'),
('comment.remove', 'Remove Comments', 'Remove comments from the platform', 'Comments'),
('comment.restore', 'Restore Comments', 'Restore removed comments', 'Comments'),
('comment.lock', 'Lock Comments', 'Lock comment threads on posts', 'Comments'),
('comment.unlock', 'Unlock Comments', 'Unlock comment threads on posts', 'Comments'),
('user.view', 'View Users', 'View user profiles for moderation', 'Users'),
('user.view_history', 'View User History', 'View moderation history for a user', 'Users'),
('user.warn', 'Warn Users', 'Issue warnings to users', 'Users'),
('user.restrict', 'Restrict Users', 'Restrict user posting and commenting', 'Users'),
('user.suspend', 'Suspend Users', 'Suspend user accounts', 'Users'),
('user.unsuspend', 'Unsuspend Users', 'Lift account suspensions', 'Users'),
('user.ban', 'Ban Users', 'Permanently ban user accounts', 'Users'),
('user.unban', 'Unban Users', 'Lift account bans', 'Users'),
('report.view', 'View Reports', 'View content reports', 'Reports'),
('report.review', 'Review Reports', 'Mark reports as in review', 'Reports'),
('report.resolve', 'Resolve Reports', 'Resolve content reports', 'Reports'),
('report.dismiss', 'Dismiss Reports', 'Dismiss content reports', 'Reports'),
('report.escalate', 'Escalate Reports', 'Escalate reports to admin review', 'Reports'),
('featured_post.view', 'View Global Feed', 'View global feed submissions (reserved)', 'Global Feed'),
('featured_post.review', 'Review Global Feed', 'Review global feed submissions (reserved)', 'Global Feed'),
('featured_post.approve', 'Approve Global Feed', 'Approve global feed submissions (reserved)', 'Global Feed'),
('featured_post.reject', 'Reject Global Feed', 'Reject global feed submissions (reserved)', 'Global Feed'),
('featured_post.remove', 'Remove Global Feed', 'Remove from global feed (reserved)', 'Global Feed'),
('featured_post.restore', 'Restore Global Feed', 'Restore global feed items (reserved)', 'Global Feed'),
('featured_post.escalate', 'Escalate Global Feed', 'Escalate global feed items (reserved)', 'Global Feed'),
('moderator.view', 'View Moderators', 'View moderator list (admin only)', 'Moderators'),
('moderator.activity', 'View Moderator Activity', 'View moderator activity logs', 'Moderators'),
('audit.view', 'View Audit Logs', 'View moderation audit logs', 'Audit');
