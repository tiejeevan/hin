import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sql, isNull, desc } from 'drizzle-orm';
import * as schema from '@hin/db';
import { BroadcastDelivery, BroadcastSystemMessageSchema, Notification, ReportStatus, ReviewReportSchema, SystemBroadcast, SystemSettings, UpdateSystemSettingsSchema } from '@hin/types';
import { sign } from 'hono/jwt';
import type { Env } from '../types';
import { getAuthUser, JWT_SECRET } from '../lib/auth';
import { isNotificationEnabled, toPublicSettings } from '../lib/user-settings';
import { listReports, reviewReport } from '../lib/reports';
import { softDeleteUser, reinstateUser, computeAccountStatus } from '../lib/user-lifecycle';
import { getSystemSettings, updateSystemSettings } from '../lib/system-settings';
import { broadcastToAll } from '../lib/realtime';
import { writeAuditLog } from '../lib/audit';

const admin = new Hono<{ Bindings: Env }>();

// Admin stats & user list (filtering out deleted users)
admin.get('/stats', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });

  const totalUsers = await db.select({ value: count() }).from(schema.users).where(sql`${schema.users.deletedAt} IS NULL`).get();
  const deletedUsers = await db.select({ value: count() }).from(schema.users).where(sql`${schema.users.deletedAt} IS NOT NULL`).get();
  const totalPosts = await db.select({ value: count() }).from(schema.posts).where(sql`${schema.posts.deletedAt} IS NULL`).get();
  const totalComments = await db.select({ value: count() }).from(schema.comments).where(sql`${schema.comments.deletedAt} IS NULL`).get();
  const totalMessages = await db.select({ value: count() }).from(schema.messages).where(sql`${schema.messages.deletedAt} IS NULL`).get();

  const allUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
    createdAt: schema.users.createdAt,
    deletedAt: schema.users.deletedAt,
    deletionSource: schema.users.deletionSource,
  })
  .from(schema.users)
  .all();

  return c.json({
    stats: {
      users: totalUsers?.value || 0,
      deletedUsers: deletedUsers?.value || 0,
      posts: totalPosts?.value || 0,
      comments: totalComments?.value || 0,
      messages: totalMessages?.value || 0,
    },
    users: allUsers.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      deletedAt: u.deletedAt,
      deletionSource: u.deletionSource,
      accountStatus: computeAccountStatus(u.deletedAt, u.deletionSource),
    })),
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

  // Audit: admin impersonated a user
  await writeAuditLog(c, {
    userId: authUser.id,
    eventType: 'admin_impersonate',
    success: true,
    targetUserId: targetUser.id,
  });

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

  // Audit: admin changed a user's role
  await writeAuditLog(c, {
    userId: authUser.id,
    eventType: 'role_change',
    success: true,
    targetUserId: userId,
  });

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
    const [recipients, allSettingsRows] = await Promise.all([
      db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(isNull(schema.users.deletedAt))
        .all(),
      db.select().from(schema.userSettings).all(),
    ]);

    const settingsByUserId = new Map(allSettingsRows.map(row => [row.userId, row]));
    const eligibleRecipients = recipients.filter(recipient => {
      const row = settingsByUserId.get(recipient.id);
      const settings = toPublicSettings(row ?? {
        userId: recipient.id,
        notifyLikes: 1,
        notifyComments: 1,
        notifyMentions: 1,
        notifyDms: 1,
        notifySystem: 1,
        muteAllToasts: 0,
        chatIconMode: 'global',
        chatIconPages: '[]',
        extensionsJson: '{}',
        updatedAt: new Date().toISOString(),
      }, false);
      return isNotificationEnabled(settings, 'system');
    });

    const BATCH_SIZE = 50;
    const createdNotifs: Notification[] = [];

    for (let i = 0; i < eligibleRecipients.length; i += BATCH_SIZE) {
      const batch = eligibleRecipients.slice(i, i + BATCH_SIZE);
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
  const result = await softDeleteUser(db, userId, 'admin');
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 404);
  }

  // Audit: admin deleted a user account
  await writeAuditLog(c, {
    userId: authUser.id,
    eventType: 'account_delete',
    success: true,
    targetUserId: userId,
  });

  return c.json({ success: true });
});

admin.post('/users/:id/reinstate', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await reinstateUser(db, userId);
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 404);
  }

  return c.json({ success: true });
});

admin.get('/settings', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  const systemSettings = await getSystemSettings(db);
  return c.json(systemSettings satisfies SystemSettings);
});

admin.patch('/settings', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSystemSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const systemSettings = await updateSystemSettings(db, parsed.data);

  await broadcastToAll(c.env, {
    type: 'system_settings_changed',
    payload: { settings: systemSettings },
  });

  return c.json(systemSettings satisfies SystemSettings);
});

// List content reports for admin review
admin.get('/reports', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const statusParam = c.req.query('status') || 'pending';
  if (statusParam !== 'pending' && statusParam !== 'dismissed' && statusParam !== 'action_taken') {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const cursorParam = c.req.query('cursor');
  let cursor: number | null = null;
  if (cursorParam !== undefined && cursorParam !== '') {
    const parsed = parseInt(cursorParam);
    if (isNaN(parsed)) return c.json({ error: 'Invalid cursor' }, 400);
    cursor = parsed;
  }

  const db = drizzle(c.env.DB, { schema });
  const page = await listReports(db, statusParam as ReportStatus, cursor);
  return c.json(page);
});

// Review a content report
admin.patch('/reports/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const reportId = parseInt(c.req.param('id'));
  if (isNaN(reportId)) return c.json({ error: 'Invalid report id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = ReviewReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const result = await reviewReport(db, authUser.id, reportId, parsed.data.action);
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 404);
  }

  return c.json({ success: true, report: result.report });
});

export default admin;
