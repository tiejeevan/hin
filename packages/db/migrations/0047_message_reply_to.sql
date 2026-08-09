ALTER TABLE messages ADD COLUMN reply_to_message_id integer REFERENCES messages(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX messages_reply_to_message_id_idx ON messages (reply_to_message_id);
