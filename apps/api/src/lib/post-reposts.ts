import { and, count, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Notification, PostVisibility } from '@hin/types';
import type { Env } from '../types';
import { shouldDeliverNotification } from './blocks';
import { getOrCreateUserSettings, isNotificationEnabled } from './user-settings';
import { sendWebPushForNotification } from './push';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** If the post is a silent repost, resolve to its original; otherwise return itself. */
export function resolveRepostRoot(post: {
  id: number;
  repostOfPostId: number | null;
  isQuote: number;
}): number {
  if (post.repostOfPostId != null && post.isQuote === 0) {
    return post.repostOfPostId;
  }
  return post.id;
}

export async function countSilentReposts(db: Db, originalPostId: number): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.repostOfPostId, originalPostId),
        eq(schema.posts.isQuote, 0),
        isNull(schema.posts.deletedAt),
      ),
    )
    .get();
  return res?.value ?? 0;
}

export async function findSilentRepostRow(
  db: Db,
  userId: number,
  originalPostId: number,
): Promise<typeof schema.posts.$inferSelect | undefined> {
  return db
    .select()
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.userId, userId),
        eq(schema.posts.repostOfPostId, originalPostId),
        eq(schema.posts.isQuote, 0),
      ),
    )
    .get();
}

export async function notifyPostRedistribute(
  db: Db,
  env: Env,
  opts: {
    type: 'repost' | 'quote';
    originalAuthorId: number;
    originalPostId: number;
    entityId: number;
    senderId: number;
    senderUsername: string;
  },
): Promise<void> {
  if (opts.originalAuthorId === opts.senderId) return;

  const recipientSettings = await getOrCreateUserSettings(db, opts.originalAuthorId);
  if (
    !isNotificationEnabled(recipientSettings, opts.type)
    || !(await shouldDeliverNotification(db, opts.originalAuthorId, opts.senderId))
  ) {
    return;
  }

  const content =
    opts.type === 'repost'
      ? `${opts.senderUsername} reposted your post.`
      : `${opts.senderUsername} quoted your post.`;

  const [notif] = await db.insert(schema.notifications).values({
    userId: opts.originalAuthorId,
    senderId: opts.senderId,
    type: opts.type,
    entityType: 'post',
    entityId: opts.entityId,
    content,
    read: 0,
  }).returning();

  const notifPayload: Notification = {
    id: notif.id,
    userId: opts.originalAuthorId,
    senderId: opts.senderId,
    senderUsername: opts.senderUsername,
    type: opts.type,
    entityType: 'post',
    entityId: opts.entityId,
    commentId: null,
    content,
    read: false,
    createdAt: notif.createdAt,
  };

  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: opts.originalAuthorId,
        notification: notifPayload,
      }),
    }));
  } catch (_e) {}

  await sendWebPushForNotification(env, db, notifPayload);
}

export type { PostVisibility };
