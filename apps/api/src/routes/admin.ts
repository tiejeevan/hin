import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sql, isNull, desc } from 'drizzle-orm';
import * as schema from '@hin/db';
import {
  BroadcastDelivery,
  BroadcastSystemMessageSchema,
  isHingotOutboundEmail,
  Notification,
  outboundFromWarnings,
  ReportStatus,
  ResetPlatformDataSchema,
  ReviewReportSchema,
  SystemBroadcast,
  SystemSettings,
  UpdateSystemSettingsSchema,
} from '@hin/types';
import { isValidEmail, normalizeEmail } from '../lib/otp';
import { sign } from 'hono/jwt';
import type { Env } from '../types';
import { getAuthUser, getJwtSecret } from '../lib/auth';
import { permissionForReportAction } from '../lib/moderation';
import { hasPermissionInSet, getUserPermissions } from '../lib/permissions';
import { listReports, reviewReport } from '../lib/reports';
import { softDeleteUser, reinstateUser, computeAccountStatus } from '../lib/user-lifecycle';
import { getSystemSettings, updateSystemSettings } from '../lib/system-settings';
import { getRateLimitCatalog } from '../lib/rate-limit-catalog';
import {
  broadcastEvent,
  broadcastNotificationsBatch,
  broadcastSystemToast,
  deferBroadcast,
} from '../lib/realtime';
import { writeAuditLog } from '../lib/audit';
import { sendWebPushBatch } from '../lib/push';
import {
  normalizeAdminUserSearchQuery,
  searchPromoteCandidateUsers,
} from '../lib/admin-user-search';

const admin = new Hono<{ Bindings: Env }>();

/** Server-side search for promote-moderator (role=user only). Does not load the full user table. */
admin.get('/users/search', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const normalized = normalizeAdminUserSearchQuery(c.req.query('q') ?? '');
  const db = drizzle(c.env.DB, { schema });
  const users = await searchPromoteCandidateUsers(db, normalized);
  return c.json({ users });
});

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

  const [allUsers, postCountRows] = await Promise.all([
    db.select({
      id: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
      deletedAt: schema.users.deletedAt,
      deletionSource: schema.users.deletionSource,
      country: schema.users.country,
    })
      .from(schema.users)
      .all(),
    db.select({
      userId: schema.posts.userId,
      value: count(),
    })
      .from(schema.posts)
      .where(isNull(schema.posts.deletedAt))
      .groupBy(schema.posts.userId)
      .all(),
  ]);

  const postCountByUserId = new Map(postCountRows.map((r) => [r.userId, r.value ?? 0]));

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
      country: u.country,
      postCount: postCountByUserId.get(u.id) ?? 0,
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
  }, getJwtSecret(c.env), 'HS256');

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

  const { role } = await c.req.json<{ role: 'user' | 'admin' | 'moderator' }>();
  if (role === 'moderator') {
    return c.json({ error: 'Use Admin → Moderators to assign the moderator role' }, 400);
  }
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
    const eligibleRecipients = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .leftJoin(schema.userSettings, eq(schema.users.id, schema.userSettings.userId))
      .where(
        sql`${schema.users.deletedAt} IS NULL AND COALESCE(${schema.userSettings.notifySystem}, 1) = 1`,
      )
      .all();

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

    deferBroadcast(
      c.executionCtx,
      broadcastNotificationsBatch(c.env, createdNotifs),
    );

    // Chunked push fanout — do not block the HTTP response on large broadcasts.
    c.executionCtx.waitUntil(sendWebPushBatch(c.env, db, createdNotifs));
  }

  if (sendToast) {
    deferBroadcast(c.executionCtx, broadcastSystemToast(c.env, content));
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

admin.post('/reset-data', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = ResetPlatformDataSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Type RESET DATA to confirm this action' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const customerCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(sql`${schema.users.role} != 'admin'`)
    .get();

  const customersDeleted = customerCountRow?.count ?? 0;
  const mediaRows = await db
    .select({ r2Key: schema.mediaUploads.r2Key })
    .from(schema.mediaUploads)
    .where(sql`${schema.mediaUploads.type} IN ('post', 'chat') OR ${schema.mediaUploads.userId} IN (SELECT id FROM users WHERE role != 'admin')`)
    .all();

  for (const row of mediaRows) {
    await c.env.MEDIA.delete(row.r2Key);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM poll_votes'),
    c.env.DB.prepare('DELETE FROM poll_options'),
    c.env.DB.prepare('DELETE FROM polls'),
    c.env.DB.prepare('DELETE FROM comment_likes'),
    c.env.DB.prepare('DELETE FROM comments'),
    c.env.DB.prepare('DELETE FROM post_hashtags'),
    c.env.DB.prepare('DELETE FROM post_edit_history'),
    c.env.DB.prepare('DELETE FROM likes'),
    c.env.DB.prepare('DELETE FROM post_bookmarks'),
    c.env.DB.prepare('DELETE FROM post_shares'),
    c.env.DB.prepare("DELETE FROM media_uploads WHERE type IN ('post', 'chat') OR user_id IN (SELECT id FROM users WHERE role != 'admin')"),
    c.env.DB.prepare('DELETE FROM posts'),
    c.env.DB.prepare('DELETE FROM hashtags'),
    c.env.DB.prepare('DELETE FROM messages'),
    c.env.DB.prepare('DELETE FROM video_calls'),
    c.env.DB.prepare('DELETE FROM video_call_allowlist'),
    c.env.DB.prepare('DELETE FROM notifications'),
    c.env.DB.prepare('DELETE FROM item_comment_likes'),
    c.env.DB.prepare('DELETE FROM item_comments'),
    c.env.DB.prepare('DELETE FROM item_bookmarks'),
    c.env.DB.prepare('DELETE FROM olabid_items'),
    c.env.DB.prepare('DELETE FROM user_follows'),
    c.env.DB.prepare('DELETE FROM follow_requests'),
    c.env.DB.prepare('DELETE FROM user_blocks'),
    c.env.DB.prepare('DELETE FROM user_mutes'),
    c.env.DB.prepare('DELETE FROM content_reports'),
    c.env.DB.prepare('DELETE FROM points_ledger'),
    c.env.DB.prepare('DELETE FROM points_ledger_archive'),
    c.env.DB.prepare('DELETE FROM user_equipped_badges'),
    c.env.DB.prepare('DELETE FROM user_badges'),
    c.env.DB.prepare('DELETE FROM user_stat_counters'),
    c.env.DB.prepare('DELETE FROM user_streaks'),
    c.env.DB.prepare('DELETE FROM user_gamification'),
    c.env.DB.prepare('DELETE FROM event_participants'),
    c.env.DB.prepare('DELETE FROM event_wins'),
    c.env.DB.prepare('DELETE FROM system_broadcasts'),
    c.env.DB.prepare('DELETE FROM link_previews'),
    c.env.DB.prepare('DELETE FROM audit_logs'),
    c.env.DB.prepare('DELETE FROM intro_walkthrough'),
    c.env.DB.prepare('DELETE FROM user_settings'),
    c.env.DB.prepare("DELETE FROM users WHERE role != 'admin'"),
  ]);

  const adminCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'))
    .get();

  const adminsRemaining = adminCountRow?.count ?? 0;

  await writeAuditLog(c, {
    userId: authUser.id,
    eventType: 'platform_reset',
    success: true,
  });

  return c.json({ success: true, customersDeleted, adminsRemaining });
});

admin.get('/rate-limits', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json(getRateLimitCatalog());
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

  if (parsed.data.outboundFromEmail !== undefined) {
    const email = normalizeEmail(parsed.data.outboundFromEmail);
    if (!isValidEmail(email)) {
      return c.json({ error: 'Enter a valid outbound From email address' }, 400);
    }
    if (!isHingotOutboundEmail(email)) {
      return c.json({ error: 'Outbound From must be an @hingot.com address' }, 400);
    }
    parsed.data.outboundFromEmail = email;
  }

  const db = drizzle(c.env.DB, { schema });
  const systemSettings = await updateSystemSettings(db, parsed.data);
  const warnings = parsed.data.outboundFromEmail
    ? outboundFromWarnings(parsed.data.outboundFromEmail)
    : [];

  deferBroadcast(c.executionCtx, broadcastEvent(c.env, {
    type: 'system_settings_changed',
    payload: { settings: systemSettings },
  }));

  return c.json({
    ...systemSettings,
    ...(warnings.length > 0 ? { warnings } : {}),
  } satisfies SystemSettings & { warnings?: string[] });
});

// List content reports for admin review
admin.get('/reports', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
  const db = drizzle(c.env.DB, { schema });
  const perms = await getUserPermissions(db, authUser);
  if (!hasPermissionInSet(perms, 'report.view')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const statusParam = c.req.query('status') || 'pending';
  const validStatuses = ['pending', 'in_review', 'resolved', 'dismissed', 'action_taken', 'escalated'];
  if (!validStatuses.includes(statusParam)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const cursorParam = c.req.query('cursor');
  let cursor: number | null = null;
  if (cursorParam !== undefined && cursorParam !== '') {
    const parsed = parseInt(cursorParam);
    if (isNaN(parsed)) return c.json({ error: 'Invalid cursor' }, 400);
    cursor = parsed;
  }

  const page = await listReports(db, statusParam as ReportStatus, cursor);
  return c.json(page);
});

// Review a content report
admin.patch('/reports/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
  const db = drizzle(c.env.DB, { schema });
  const perms = await getUserPermissions(db, authUser);

  const reportId = parseInt(c.req.param('id'));
  if (isNaN(reportId)) return c.json({ error: 'Invalid report id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = ReviewReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const permKey = permissionForReportAction(parsed.data.action);
  if (permKey && !hasPermissionInSet(perms, permKey)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const result = await reviewReport(db, authUser.id, reportId, parsed.data.action, parsed.data.reason);
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 404);
  }

  return c.json({ success: true, report: result.report });
});

export default admin;
