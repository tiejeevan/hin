import { and, inArray, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { Notification } from '@hin/types';
import type { Env } from '../types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Unique @usernames mentioned in text (exact case, deduped). */
export function parseMentions(content: string): string[] {
  const matches = content.matchAll(/@([a-zA-Z0-9_]{3,30})\b/g);
  const seen = new Set<string>();
  const usernames: string[] = [];
  for (const match of matches) {
    const username = match[1];
    if (seen.has(username)) continue;
    seen.add(username);
    usernames.push(username);
  }
  return usernames;
}

/**
 * Create mention notifications for existing users referenced via @username.
 * Matching is case-sensitive. Skips the author and unknown usernames.
 * Dedupes within one piece of content.
 */
export async function notifyMentions(
  db: Db,
  env: Env,
  opts: {
    content: string;
    senderId: number;
    senderUsername: string;
    /** Post id (entity_id always points at the post for mentions). */
    entityId: number;
    /** Set when the mention is inside a comment. */
    commentId?: number | null;
    context: 'post' | 'comment';
  }
): Promise<void> {
  const usernames = parseMentions(opts.content);
  if (usernames.length === 0) return;

  const mentionedUsers = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
    })
    .from(schema.users)
    .where(
      and(
        isNull(schema.users.deletedAt),
        inArray(schema.users.username, usernames),
      )
    )
    .all();

  const recipients = mentionedUsers.filter(u => u.id !== opts.senderId);
  if (recipients.length === 0) return;

  const contextLabel = opts.context === 'post' ? 'post' : 'comment';
  const notificationContent = `${opts.senderUsername} mentioned you in a ${contextLabel}.`;
  const commentId = opts.commentId ?? null;

  for (const recipient of recipients) {
    const [notif] = await db
      .insert(schema.notifications)
      .values({
        userId: recipient.id,
        senderId: opts.senderId,
        type: 'mention',
        entityType: 'post',
        entityId: opts.entityId,
        commentId,
        content: notificationContent,
        read: 0,
      })
      .returning();

    const notifPayload: Notification = {
      id: notif.id,
      userId: recipient.id,
      senderId: opts.senderId,
      senderUsername: opts.senderUsername,
      type: 'mention',
      entityType: 'post',
      entityId: opts.entityId,
      commentId,
      content: notificationContent,
      read: false,
      createdAt: notif.createdAt,
    };

    try {
      const doId = env.REALTIME_DO.idFromName('global');
      const doStub = env.REALTIME_DO.get(doId);
      await doStub.fetch(
        new Request('http://realtime/broadcast-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId: recipient.id, notification: notifPayload }),
        })
      );
    } catch (e) {}
  }
}
