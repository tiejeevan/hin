import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Notification } from '@hin/types';
import type { Env } from '../types';
import { broadcastEvent } from './realtime';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function notifyModerationTarget(
  db: Db,
  env: Env | undefined,
  opts: {
    recipientId: number;
    actorId: number;
    actorUsername: string;
    content: string;
    entityType: 'post' | 'system' | 'user';
    entityId: number;
  },
): Promise<void> {
  const [notif] = await db
    .insert(schema.notifications)
    .values({
      userId: opts.recipientId,
      senderId: opts.actorId,
      type: 'moderation',
      entityType: opts.entityType,
      entityId: opts.entityId,
      content: opts.content,
      category: 'social',
      read: 0,
    })
    .returning();

  if (!env || !notif) return;

  const payload: Notification = {
    id: notif.id,
    userId: notif.userId,
    senderId: opts.actorId,
    senderUsername: opts.actorUsername,
    type: 'moderation',
    entityType: opts.entityType,
    entityId: opts.entityId,
    commentId: null,
    content: opts.content,
    category: 'social',
    read: false,
    createdAt: notif.createdAt,
  };

  await broadcastEvent(env, { type: 'notification', payload });
}
