-- Audit log table: records every auth event and privileged admin action.
-- Retention: rows hard-deleted after 90 days. User-owned rows soft-deleted on account deletion.
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer REFERENCES `users`(`id`) ON DELETE SET NULL,
  `event_type` text NOT NULL,
  `success` integer NOT NULL,
  `failure_reason` text,
  `ip_address` text,
  `country` text,
  `region` text,
  `city` text,
  `postal_code` text,
  `latitude` text,
  `longitude` text,
  `timezone` text,
  `user_agent` text,
  `device_type` text,
  `os` text,
  `browser` text,
  `client_local_time` text,
  `session_id` text,
  `target_user_id` integer REFERENCES `users`(`id`) ON DELETE SET NULL,
  `deleted_at` text,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_event_type_idx` ON `audit_logs` (`event_type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_ip_address_idx` ON `audit_logs` (`ip_address`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_session_id_idx` ON `audit_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_deleted_at_idx` ON `audit_logs` (`deleted_at`);
