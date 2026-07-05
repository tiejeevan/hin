import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Notification } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';

const notifications = new Hono<{ Bindings: Env }>();

// Get notifications
notifications.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

  const rawNotifs = await db
    .select({
      id: schema.notifications.id,
      userId: schema.notifications.userId,
      senderId: schema.notifications.senderId,
      type: schema.notifications.type,
      entityType: schema.notifications.entityType,
      entityId: schema.notifications.entityId,
      commentId: schema.notifications.commentId,
      content: schema.notifications.content,
      read: schema.notifications.read,
      createdAt: schema.notifications.createdAt,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, authUser.id))
    .orderBy(desc(schema.notifications.createdAt))
    .all();

  const populatedNotifs: Notification[] = await Promise.all(
    rawNotifs.map(async (notif) => {
      const sender = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, notif.senderId)).get();
      const entityType =
        notif.entityType === 'post' || notif.entityType === 'message' || notif.entityType === 'system' || notif.entityType === 'user'
          ? notif.entityType
          : notif.type === 'message'
            ? 'message'
            : notif.type === 'system'
              ? 'system'
              : notif.type === 'follow' || notif.type === 'follow_request' || notif.type === 'follow_accepted'
                ? 'user'
                : 'post';
      return {
        id: notif.id,
        userId: notif.userId,
        senderId: notif.senderId,
        senderUsername: sender?.username || 'Someone',
        type: notif.type as Notification['type'],
        entityType,
        entityId: notif.entityId,
        commentId: notif.commentId ?? null,
        content: notif.content,
        read: notif.read === 1,
        createdAt: notif.createdAt,
      };
    })
  );

  return c.json(populatedNotifs);
});

// Mark all notifications as read
notifications.post('/read-all', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

  await db
    .update(schema.notifications)
    .set({ read: 1 })
    .where(
      and(
        eq(schema.notifications.userId, authUser.id),
        eq(schema.notifications.read, 0)
      )
    )
    .run();

  return c.json({ success: true });
});

// Mark notification as read
notifications.post('/:id/read', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const notifId = parseInt(c.req.param('id'));

  await db
    .update(schema.notifications)
    .set({ read: 1 })
    .where(
      and(
        eq(schema.notifications.id, notifId),
        eq(schema.notifications.userId, authUser.id)
      )
    )
    .run();

  return c.json({ success: true });
});

export default notifications;
