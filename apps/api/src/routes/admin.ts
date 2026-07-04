import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sql, isNull, desc } from 'drizzle-orm';
import * as schema from '@hin/db';
import { BroadcastDelivery, BroadcastSystemMessageSchema, Notification, SystemBroadcast } from '@hin/types';
import { sign } from 'hono/jwt';
import type { Env } from '../types';
import { getAuthUser, JWT_SECRET } from '../lib/auth';

const admin = new Hono<{ Bindings: Env }>();

// Admin stats & user list (filtering out deleted users)
admin.get('/stats', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });

  const totalUsers = await db.select({ value: count() }).from(schema.users).where(sql`${schema.users.deletedAt} IS NULL`).get();
  const totalPosts = await db.select({ value: count() }).from(schema.posts).where(sql`${schema.posts.deletedAt} IS NULL`).get();
  const totalComments = await db.select({ value: count() }).from(schema.comments).where(sql`${schema.comments.deletedAt} IS NULL`).get();
  const totalMessages = await db.select({ value: count() }).from(schema.messages).where(sql`${schema.messages.deletedAt} IS NULL`).get();

  const allUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
    createdAt: schema.users.createdAt,
  })
  .from(schema.users)
  .where(sql`${schema.users.deletedAt} IS NULL`)
  .all();

  return c.json({
    stats: {
      users: totalUsers?.value || 0,
      posts: totalPosts?.value || 0,
      comments: totalComments?.value || 0,
      messages: totalMessages?.value || 0,
    },
    users: allUsers,
  });
});

// Admin Impersonation Endpoint
admin.post('/impersonate', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { userId } = await c.req.json<{ userId: number }>();
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const targetUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!targetUser) {
    return c.json({ error: 'User not found' }, 404);
  }
  if (targetUser.deletedAt) {
    return c.json({ error: 'Cannot impersonate a deleted user' }, 400);
  }

  // Generate delegation token for target user
  const token = await sign({ 
    id: targetUser.id, 
    username: targetUser.username, 
    role: targetUser.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: {
      id: targetUser.id,
      username: targetUser.username,
      role: targetUser.role,
      createdAt: targetUser.createdAt,
    }
  });
});

// Admin User Role Update
admin.put('/users/:id/role', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (userId === authUser.id) {
    return c.json({ error: 'Cannot change your own role' }, 400);
  }

  const { role } = await c.req.json<{ role: 'user' | 'admin' }>();
  if (role !== 'user' && role !== 'admin') {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  await db.update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ success: true });
});

// List system broadcast audit history
admin.get('/broadcasts', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select({
      id: schema.systemBroadcasts.id,
      senderId: schema.systemBroadcasts.senderId,
      content: schema.systemBroadcasts.content,
      delivery: schema.systemBroadcasts.delivery,
      notificationsCreated: schema.systemBroadcasts.notificationsCreated,
      createdAt: schema.systemBroadcasts.createdAt,
      senderUsername: schema.users.username,
    })
    .from(schema.systemBroadcasts)
    .leftJoin(schema.users, eq(schema.systemBroadcasts.senderId, schema.users.id))
    .orderBy(desc(schema.systemBroadcasts.createdAt))
    .limit(50)
    .all();

  const broadcasts: SystemBroadcast[] = rows.map(row => ({
    id: row.id,
    senderId: row.senderId,
    senderUsername: row.senderUsername || 'Unknown',
    content: row.content,
    delivery: row.delivery as BroadcastDelivery,
    notificationsCreated: row.notificationsCreated,
    createdAt: row.createdAt,
  }));

  return c.json(broadcasts);
});

// Broadcast a system message to all users (notification, toast, or both).
// Always writes a system_broadcasts audit row, including toast-only sends.
admin.post('/broadcast', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = BroadcastSystemMessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const { message, delivery } = parsed.data;
  const content = message.trim();
  const sendNotification = delivery === 'notification' || delivery === 'both';
  const sendToast = delivery === 'toast' || delivery === 'both';

  const db = drizzle(c.env.DB, { schema });

  const [broadcast] = await db
    .insert(schema.systemBroadcasts)
    .values({
      senderId: authUser.id,
      content,
      delivery,
      notificationsCreated: 0,
    })
    .returning();

  let notificationsCreated = 0;

  if (sendNotification) {
    const recipients = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(isNull(schema.users.deletedAt))
      .all();

    const BATCH_SIZE = 50;
    const createdNotifs: Notification[] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const inserted = await db
        .insert(schema.notifications)
        .values(
          batch.map(recipient => ({
            userId: recipient.id,
            senderId: authUser.id,
            type: 'system',
            entityType: 'system',
            entityId: broadcast.id,
            content,
            read: 0,
          }))
        )
        .returning();

      for (const notif of inserted) {
        createdNotifs.push({
          id: notif.id,
          userId: notif.userId,
          senderId: authUser.id,
          senderUsername: authUser.username,
          type: 'system',
          entityType: 'system',
          entityId: broadcast.id,
          commentId: null,
          content,
          read: false,
          createdAt: notif.createdAt,
        });
      }
    }

    notificationsCreated = createdNotifs.length;

    await db
      .update(schema.systemBroadcasts)
      .set({ notificationsCreated })
      .where(eq(schema.systemBroadcasts.id, broadcast.id))
      .run();

    try {
      const doId = c.env.REALTIME_DO.idFromName('global');
      const doStub = c.env.REALTIME_DO.get(doId);
      await doStub.fetch(
        new Request('http://realtime/broadcast-notifications-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notifications: createdNotifs }),
        })
      );
    } catch (e) {}
  }

  if (sendToast) {
    try {
      const doId = c.env.REALTIME_DO.idFromName('global');
      const doStub = c.env.REALTIME_DO.get(doId);
      await doStub.fetch(
        new Request('http://realtime/broadcast-system-toast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
      );
    } catch (e) {}
  }

  const auditRecord: SystemBroadcast = {
    id: broadcast.id,
    senderId: authUser.id,
    senderUsername: authUser.username,
    content,
    delivery,
    notificationsCreated,
    createdAt: broadcast.createdAt,
  };

  return c.json({
    success: true,
    delivery,
    notificationsCreated,
    message: content,
    broadcast: auditRecord,
  });
});

// Admin User Soft Delete
admin.delete('/users/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (userId === authUser.id) {
    return c.json({ error: 'Cannot delete your own admin account' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Soft delete user
  await db.update(schema.users)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ success: true });
});

export default admin;
