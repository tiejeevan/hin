import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Notification } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { countUnreadNotifications, resolveNotificationEntityType } from '../lib/notifications';

const notifications = new Hono<{ Bindings: Env }>();

// Unread count for bell badge (excludes message-type notifications)
notifications.get('/unread-count', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const count = await countUnreadNotifications(db, authUser.id);
  return c.json({ count });
});

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
      senderUsername: schema.users.username,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.notifications.senderId, schema.users.id))
    .where(eq(schema.notifications.userId, authUser.id))
    .orderBy(desc(schema.notifications.createdAt))
    .all();

  const populatedNotifs: Notification[] = rawNotifs.map((notif) => ({
    id: notif.id,
    userId: notif.userId,
    senderId: notif.senderId,
    senderUsername: notif.senderUsername || 'Someone',
    type: notif.type as Notification['type'],
    entityType: resolveNotificationEntityType(notif),
    entityId: notif.entityId,
    commentId: notif.commentId ?? null,
    content: notif.content,
    read: notif.read === 1,
    createdAt: notif.createdAt,
  }));

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
