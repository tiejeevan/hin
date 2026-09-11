import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, lt } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Notification, type NotificationCategory } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  countUnreadNotifications,
  resolveNotificationEntityType,
  resolveStoredNotificationCategory,
} from '../lib/notifications';

const notifications = new Hono<{ Bindings: Env }>();

// Unread count for bell badge (excludes message-type notifications)
notifications.get('/unread-count', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const count = await countUnreadNotifications(db, authUser.id);
  return c.json({ count });
});

const NOTIFICATIONS_DEFAULT_LIMIT = 50;
const NOTIFICATIONS_MAX_LIMIT = 1000;

// Get notifications (paginated when ?limit= is set; otherwise returns up to max cap)
notifications.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');
  const usePagination = limitParam !== undefined || cursorParam !== undefined;
  const limit = usePagination
    ? Math.min(Math.max(parseInt(limitParam ?? String(NOTIFICATIONS_DEFAULT_LIMIT), 10) || NOTIFICATIONS_DEFAULT_LIMIT, 1), NOTIFICATIONS_MAX_LIMIT)
    : NOTIFICATIONS_MAX_LIMIT;
  const cursor = cursorParam !== undefined ? parseInt(cursorParam, 10) : null;

  if (cursorParam !== undefined && (Number.isNaN(cursor!) || cursor! < 0)) {
    return c.json({ error: 'Invalid cursor' }, 400);
  }

  const conditions = [eq(schema.notifications.userId, authUser.id)];
  if (cursor !== null) {
    conditions.push(lt(schema.notifications.id, cursor));
  }

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
      category: schema.notifications.category,
      read: schema.notifications.read,
      createdAt: schema.notifications.createdAt,
      senderUsername: schema.users.username,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.notifications.senderId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.id))
    .limit(limit + 1)
    .all();

  const hasMore = rawNotifs.length > limit;
  const pageRows = hasMore ? rawNotifs.slice(0, limit) : rawNotifs;

  const populatedNotifs: Notification[] = pageRows.map((notif) => ({
    id: notif.id,
    userId: notif.userId,
    senderId: notif.senderId,
    senderUsername: notif.senderUsername || 'Someone',
    type: notif.type as Notification['type'],
    entityType: resolveNotificationEntityType(notif),
    entityId: notif.entityId,
    commentId: notif.commentId ?? null,
    content: notif.content,
    category: resolveStoredNotificationCategory(notif),
    read: notif.read === 1,
    createdAt: notif.createdAt,
  }));

  if (usePagination) {
    return c.json({
      notifications: populatedNotifs,
      nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
    });
  }

  return c.json(populatedNotifs);
});

// Mark notifications as read (optional ?category=social|gamification for tab-scoped read-all)
notifications.post('/read-all', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const categoryParam = c.req.query('category');
  const category: NotificationCategory | undefined =
    categoryParam === 'social' || categoryParam === 'gamification' ? categoryParam : undefined;

  const db = drizzle(c.env.DB, { schema });

  const conditions = [
    eq(schema.notifications.userId, authUser.id),
    eq(schema.notifications.read, 0),
  ];
  if (category) {
    conditions.push(eq(schema.notifications.category, category));
  }

  await db
    .update(schema.notifications)
    .set({ read: 1 })
    .where(and(...conditions))
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
