ALTER TABLE `users` ADD COLUMN `needs_username_setup` integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Existing Google users with auto-derived or non-compliant usernames must pick a new one.
UPDATE `users`
SET `needs_username_setup` = 1
WHERE `google_id` IS NOT NULL
  AND `deleted_at` IS NULL
  AND (
    length(`username`) < 4
    OR `username` GLOB '*[A-Z]*'
    OR `username` GLOB '*[^a-z0-9_]*'
    OR `username` NOT GLOB '[a-z0-9_]*'
  );
