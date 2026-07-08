/**
 * routes/audit-logs.ts
 *
 * Admin endpoint: full audit log with filters (username/userId, event type, date range, IP).
 * User endpoint: own login history (partial — no IP, no UA string, no admin fields).
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, lt, sql, isNull, inArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import type { AuditLog, AuditLogPage, AuditLogPartial, AuditLogPartialPage } from '@hin/types';

const PAGE_SIZE = 50;
const USER_PAGE_SIZE = 30;

const auditLogs = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Admin: full audit log with filters
// GET /api/admin/audit-logs
// Query params:
//   userId      — filter by user_id
//   username    — filter by username (joined lookup)
//   eventType   — filter by event_type
//   ip          — filter by ip_address
//   country     — filter by country code
//   success     — '1' or '0'
//   from        — ISO-8601 start date (created_at >= from)
//   to          — ISO-8601 end date (created_at <= to)
//   cursor      — last seen id (for pagination)
// ---------------------------------------------------------------------------
auditLogs.get('/admin/audit-logs', async (c) => {
  try {
    const authUser = await getAuthUser(c);
    if (!authUser || authUser.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const db = drizzle(c.env.DB, { schema });

    const cursorParam = c.req.query('cursor');
    const cursor = cursorParam ? parseInt(cursorParam) : null;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam) : PAGE_SIZE;
    const userIdParam = c.req.query('userId');
    const usernameFilter = c.req.query('username')?.trim() || null;
    const eventType = c.req.query('eventType') || null;
    const ip = c.req.query('ip') || null;
    const country = c.req.query('country') || null;
    const successParam = c.req.query('success');
    const from = c.req.query('from') || null;
    const to = c.req.query('to') || null;

    // If filtering by username, resolve to userId via case-insensitive LIKE search
    let filterUserId: number | null = userIdParam ? parseInt(userIdParam) : null;
    if (usernameFilter && !filterUserId) {
      const found = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(sql`lower(${schema.users.username}) LIKE lower(${'%' + usernameFilter + '%'})`)
        .get();
      if (!found) {
        return c.json({ logs: [], nextCursor: null } satisfies AuditLogPage);
      }
      filterUserId = found.id;
    }

    // Build WHERE conditions
    const conditions = [
      // Always exclude soft-deleted logs
      isNull(schema.auditLogs.deletedAt),
    ];

    if (cursor) conditions.push(lt(schema.auditLogs.id, cursor));
    if (filterUserId) conditions.push(eq(schema.auditLogs.userId, filterUserId));
    if (eventType) conditions.push(eq(schema.auditLogs.eventType, eventType));
    if (ip) conditions.push(eq(schema.auditLogs.ipAddress, ip));
    if (country) conditions.push(eq(schema.auditLogs.country, country));
    if (successParam === '1') conditions.push(eq(schema.auditLogs.success, 1));
    if (successParam === '0') conditions.push(eq(schema.auditLogs.success, 0));
    if (from) conditions.push(sql`${schema.auditLogs.createdAt} >= ${from}`);
    if (to) conditions.push(sql`${schema.auditLogs.createdAt} <= ${to}`);

    const rows = await db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        eventType: schema.auditLogs.eventType,
        success: schema.auditLogs.success,
        failureReason: schema.auditLogs.failureReason,
        ipAddress: schema.auditLogs.ipAddress,
        country: schema.auditLogs.country,
        region: schema.auditLogs.region,
        city: schema.auditLogs.city,
        postalCode: schema.auditLogs.postalCode,
        latitude: schema.auditLogs.latitude,
        longitude: schema.auditLogs.longitude,
        timezone: schema.auditLogs.timezone,
        userAgent: schema.auditLogs.userAgent,
        deviceType: schema.auditLogs.deviceType,
        os: schema.auditLogs.os,
        browser: schema.auditLogs.browser,
        clientLocalTime: schema.auditLogs.clientLocalTime,
        sessionId: schema.auditLogs.sessionId,
        targetUserId: schema.auditLogs.targetUserId,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLogs.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    // Batch-fetch usernames for all user IDs appearing in the page
    const userIdSet = new Set<number>();
    for (const r of page) {
      if (r.userId != null) userIdSet.add(r.userId);
      if (r.targetUserId != null) userIdSet.add(r.targetUserId);
    }
    const userIdList = [...userIdSet];

    const usernameMap = new Map<number, string>();
    if (userIdList.length > 0) {
      const userRows = await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(inArray(schema.users.id, userIdList))
        .all();
      for (const u of userRows) usernameMap.set(u.id, u.username);
    }

    const logs: AuditLog[] = page.map(row => ({
      id: row.id,
      userId: row.userId ?? null,
      username: row.userId != null ? (usernameMap.get(row.userId) ?? null) : null,
      eventType: row.eventType as AuditLog['eventType'],
      success: row.success === 1,
      failureReason: row.failureReason ?? null,
      ipAddress: row.ipAddress ?? null,
      country: row.country ?? null,
      region: row.region ?? null,
      city: row.city ?? null,
      postalCode: row.postalCode ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      timezone: row.timezone ?? null,
      userAgent: row.userAgent ?? null,
      deviceType: (row.deviceType ?? null) as AuditLog['deviceType'],
      os: row.os ?? null,
      browser: row.browser ?? null,
      clientLocalTime: row.clientLocalTime ?? null,
      sessionId: row.sessionId ?? null,
      targetUserId: row.targetUserId ?? null,
      targetUsername: row.targetUserId != null ? (usernameMap.get(row.targetUserId) ?? null) : null,
      createdAt: row.createdAt,
    }));

    return c.json({ logs, nextCursor } satisfies AuditLogPage);
  } catch (err: any) {
    console.error('Audit logs admin fetch error:', err);
    return c.json({ error: err.message, stack: err.stack }, 500);
  }
});


// ---------------------------------------------------------------------------
// User: own login history (partial — no IP, no UA string, no admin fields)
// GET /api/me/audit-logs
// ---------------------------------------------------------------------------
auditLogs.get('/me/audit-logs', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? parseInt(cursorParam) : null;

  const conditions = [
    eq(schema.auditLogs.userId, authUser.id),
    isNull(schema.auditLogs.deletedAt),
    // Only show auth events to the user — not admin actions performed on them
    sql`${schema.auditLogs.eventType} IN ('login', 'register', 'logout', 'failed_login', 'password_change', 'account_delete')`,
  ];
  if (cursor) conditions.push(lt(schema.auditLogs.id, cursor));

  const rows = await db
    .select({
      id: schema.auditLogs.id,
      eventType: schema.auditLogs.eventType,
      success: schema.auditLogs.success,
      country: schema.auditLogs.country,
      region: schema.auditLogs.region,
      city: schema.auditLogs.city,
      deviceType: schema.auditLogs.deviceType,
      os: schema.auditLogs.os,
      browser: schema.auditLogs.browser,
      clientLocalTime: schema.auditLogs.clientLocalTime,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.auditLogs.id))
    .limit(USER_PAGE_SIZE + 1)
    .all();

  const hasMore = rows.length > USER_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, USER_PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const logs: AuditLogPartial[] = page.map(row => ({
    id: row.id,
    eventType: row.eventType as AuditLogPartial['eventType'],
    success: row.success === 1,
    country: row.country ?? null,
    region: row.region ?? null,
    city: row.city ?? null,
    deviceType: (row.deviceType ?? null) as AuditLogPartial['deviceType'],
    os: row.os ?? null,
    browser: row.browser ?? null,
    clientLocalTime: row.clientLocalTime ?? null,
    createdAt: row.createdAt,
  }));

  return c.json({ logs, nextCursor } satisfies AuditLogPartialPage);
});

export default auditLogs;
