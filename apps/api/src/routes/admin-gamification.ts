import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import {
  UpdateGamificationSettingsSchema,
  CreateBadgeSchema,
  UpdateBadgeSchema,
  UpdatePointRulesSchema,
  UpdateLevelConfigSchema,
  CreateEventSchema,
  UpdateEventSchema,
  AdminAwardBadgeSchema,
  ResetGamificationProgressSchema,
  type AdminBadge,
  type AdminEvent,
  type AdminEventRule,
  type EventRuleConfig,
  type GamificationActionType,
} from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  getGamificationSettings,
  setGamificationEnabled,
} from '../lib/gamification/settings';
import { getMetricCatalog } from '../lib/gamification/registry';
import { invalidateActiveEventsCache } from '../lib/gamification/events/cache';
import {
  loadAdminUserGamification,
  adminAwardBadge,
  adminRevokeBadge,
} from '../lib/gamification/admin-user';
import { archiveOldLedgerRows } from '../lib/gamification/archival';

const adminGamification = new Hono<{ Bindings: Env }>();

function requireAdmin(c: { json: (body: unknown, status?: number) => Response }) {
  return getAuthUser(c as Parameters<typeof getAuthUser>[0]).then((authUser) => {
    if (!authUser || authUser.role !== 'admin') {
      return { error: c.json({ error: 'Forbidden' }, 403) as Response };
    }
    return { authUser };
  });
}

async function loadBadgeWithRule(
  db: ReturnType<typeof drizzle<typeof schema>>,
  badgeId: number,
): Promise<AdminBadge | null> {
  const badge = await db
    .select()
    .from(schema.badges)
    .where(and(eq(schema.badges.id, badgeId), isNull(schema.badges.deletedAt)))
    .get();

  if (!badge) return null;

  const rule = await db
    .select({
      badgeId: schema.badgeRules.badgeId,
      metricKey: schema.badgeRules.metricKey,
      operator: schema.badgeRules.operator,
      threshold: schema.badgeRules.threshold,
    })
    .from(schema.badgeRules)
    .where(eq(schema.badgeRules.badgeId, badgeId))
    .get();

  return {
    id: badge.id,
    name: badge.name,
    description: badge.description,
    imageUrl: badge.imageUrl,
    isActive: badge.isActive === 1,
    createdAt: badge.createdAt,
    rule: rule ?? null,
  };
}

adminGamification.get('/settings', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const db = drizzle(c.env.DB, { schema });
  return c.json(await getGamificationSettings(db));
});

adminGamification.patch('/settings', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateGamificationSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  return c.json(await setGamificationEnabled(db, parsed.data.gamificationEnabled));
});

adminGamification.get('/metrics', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  return c.json(getMetricCatalog());
});

adminGamification.get('/badges', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const db = drizzle(c.env.DB, { schema });
  const badges = await db
    .select()
    .from(schema.badges)
    .where(isNull(schema.badges.deletedAt))
    .orderBy(asc(schema.badges.id))
    .all();

  const result: AdminBadge[] = [];
  for (const badge of badges) {
    const loaded = await loadBadgeWithRule(db, badge.id);
    if (loaded) result.push(loaded);
  }

  return c.json({ badges: result });
});

adminGamification.post('/badges', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = await c.req.json().catch(() => null);
  const parsed = CreateBadgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const data = parsed.data;

  const [badge] = await db.insert(schema.badges).values({
    name: data.name,
    description: data.description ?? '',
    imageUrl: data.imageUrl ?? null,
    isActive: 1,
  }).returning();

  await db.insert(schema.badgeRules).values({
    badgeId: badge.id,
    metricKey: data.metricKey,
    operator: data.operator ?? '>=',
    threshold: data.threshold,
  }).run();

  const loaded = await loadBadgeWithRule(db, badge.id);
  return c.json(loaded, 201);
});

adminGamification.patch('/badges/:id', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const badgeId = parseInt(c.req.param('id'), 10);
  if (isNaN(badgeId)) return c.json({ error: 'Invalid badge id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateBadgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const existing = await db
    .select()
    .from(schema.badges)
    .where(and(eq(schema.badges.id, badgeId), isNull(schema.badges.deletedAt)))
    .get();

  if (!existing) return c.json({ error: 'Badge not found' }, 404);

  const data = parsed.data;
  const badgePatch: Partial<typeof schema.badges.$inferInsert> = {};
  if (data.name !== undefined) badgePatch.name = data.name;
  if (data.description !== undefined) badgePatch.description = data.description;
  if (data.imageUrl !== undefined) badgePatch.imageUrl = data.imageUrl;
  if (data.isActive !== undefined) badgePatch.isActive = data.isActive ? 1 : 0;

  if (Object.keys(badgePatch).length > 0) {
    await db.update(schema.badges).set(badgePatch).where(eq(schema.badges.id, badgeId)).run();
  }

  if (data.metricKey !== undefined || data.operator !== undefined || data.threshold !== undefined) {
    const rule = await db
      .select()
      .from(schema.badgeRules)
      .where(eq(schema.badgeRules.badgeId, badgeId))
      .get();

    if (rule) {
      await db.update(schema.badgeRules).set({
        metricKey: data.metricKey ?? rule.metricKey,
        operator: data.operator ?? rule.operator,
        threshold: data.threshold ?? rule.threshold,
      }).where(eq(schema.badgeRules.badgeId, badgeId)).run();
    } else if (data.metricKey && data.threshold) {
      await db.insert(schema.badgeRules).values({
        badgeId,
        metricKey: data.metricKey,
        operator: data.operator ?? '>=',
        threshold: data.threshold,
      }).run();
    }
  }

  const loaded = await loadBadgeWithRule(db, badgeId);
  return c.json(loaded);
});

adminGamification.delete('/badges/:id', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const badgeId = parseInt(c.req.param('id'), 10);
  if (isNaN(badgeId)) return c.json({ error: 'Invalid badge id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const existing = await db
    .select()
    .from(schema.badges)
    .where(and(eq(schema.badges.id, badgeId), isNull(schema.badges.deletedAt)))
    .get();

  if (!existing) return c.json({ error: 'Badge not found' }, 404);

  await db.update(schema.badges).set({
    isActive: 0,
    deletedAt: new Date().toISOString(),
  }).where(eq(schema.badges.id, badgeId)).run();

  return c.json({ success: true });
});

adminGamification.get('/point-rules', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const db = drizzle(c.env.DB, { schema });
  const rules = await db.select().from(schema.pointRules).all();

  return c.json({
    rules: rules.map((r) => ({
      actionType: r.actionType as GamificationActionType,
      points: r.points,
      isActive: r.isActive === 1,
    })),
  });
});

adminGamification.patch('/point-rules', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdatePointRulesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  for (const rule of parsed.data.rules) {
    await db.insert(schema.pointRules).values({
      actionType: rule.actionType,
      points: rule.points,
      isActive: rule.isActive === false ? 0 : 1,
    }).onConflictDoUpdate({
      target: schema.pointRules.actionType,
      set: {
        points: rule.points,
        isActive: rule.isActive === false ? 0 : 1,
      },
    }).run();
  }

  const rules = await db.select().from(schema.pointRules).all();
  return c.json({
    rules: rules.map((r) => ({
      actionType: r.actionType as GamificationActionType,
      points: r.points,
      isActive: r.isActive === 1,
    })),
  });
});

adminGamification.get('/levels', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const db = drizzle(c.env.DB, { schema });
  const levels = await db
    .select()
    .from(schema.levelConfig)
    .orderBy(asc(schema.levelConfig.level))
    .all();

  return c.json({
    levels: levels.map((l) => ({ level: l.level, minPoints: l.minPoints })),
  });
});

adminGamification.patch('/levels', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateLevelConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  for (const entry of parsed.data.levels) {
    await db.insert(schema.levelConfig).values({
      level: entry.level,
      minPoints: entry.minPoints,
    }).onConflictDoUpdate({
      target: schema.levelConfig.level,
      set: { minPoints: entry.minPoints },
    }).run();
  }

  const levels = await db
    .select()
    .from(schema.levelConfig)
    .orderBy(asc(schema.levelConfig.level))
    .all();

  return c.json({
    levels: levels.map((l) => ({ level: l.level, minPoints: l.minPoints })),
  });
});

async function loadEventWithRules(
  db: ReturnType<typeof drizzle<typeof schema>>,
  eventId: number,
): Promise<AdminEvent | null> {
  const event = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).get();
  if (!event) return null;

  const rules = await db
    .select()
    .from(schema.eventRules)
    .where(eq(schema.eventRules.eventId, eventId))
    .all();

  return {
    id: event.id,
    name: event.name,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status as AdminEvent['status'],
    bannerUrl: event.bannerUrl,
    requiresOptIn: event.requiresOptIn === 1,
    createdAt: event.createdAt,
    rules: rules.map((r) => ({
      id: r.id,
      metricKey: r.metricKey,
      winType: r.winType as AdminEventRule['winType'],
      config: JSON.parse(r.config) as EventRuleConfig,
    })),
  };
}

adminGamification.get('/events', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const db = drizzle(c.env.DB, { schema });
  const eventRows = await db
    .select()
    .from(schema.events)
    .orderBy(asc(schema.events.id))
    .all();

  const result: AdminEvent[] = [];
  for (const row of eventRows) {
    const loaded = await loadEventWithRules(db, row.id);
    if (loaded) result.push(loaded);
  }

  return c.json({ events: result });
});

adminGamification.post('/events', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = await c.req.json().catch(() => null);
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const data = parsed.data;

  const [event] = await db.insert(schema.events).values({
    name: data.name,
    description: data.description ?? '',
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    status: data.status ?? 'draft',
    bannerUrl: data.bannerUrl ?? null,
    requiresOptIn: data.requiresOptIn === false ? 0 : 1,
  }).returning();

  for (const rule of data.rules) {
    await db.insert(schema.eventRules).values({
      eventId: event.id,
      metricKey: rule.metricKey,
      winType: rule.winType,
      config: JSON.stringify(rule.config),
    }).run();
  }

  invalidateActiveEventsCache();
  const loaded = await loadEventWithRules(db, event.id);
  return c.json(loaded, 201);
});

adminGamification.patch('/events/:id', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const eventId = parseInt(c.req.param('id'), 10);
  if (isNaN(eventId)) return c.json({ error: 'Invalid event id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const existing = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).get();
  if (!existing) return c.json({ error: 'Event not found' }, 404);

  const data = parsed.data;
  const patch: Partial<typeof schema.events.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.startsAt !== undefined) patch.startsAt = data.startsAt;
  if (data.endsAt !== undefined) patch.endsAt = data.endsAt;
  if (data.status !== undefined) patch.status = data.status;
  if (data.bannerUrl !== undefined) patch.bannerUrl = data.bannerUrl;
  if (data.requiresOptIn !== undefined) patch.requiresOptIn = data.requiresOptIn ? 1 : 0;

  if (Object.keys(patch).length > 0) {
    await db.update(schema.events).set(patch).where(eq(schema.events.id, eventId)).run();
  }

  if (data.rules) {
    await db.delete(schema.eventRules).where(eq(schema.eventRules.eventId, eventId)).run();
    for (const rule of data.rules) {
      await db.insert(schema.eventRules).values({
        eventId,
        metricKey: rule.metricKey,
        winType: rule.winType,
        config: JSON.stringify(rule.config),
      }).run();
    }
  }

  invalidateActiveEventsCache();
  const loaded = await loadEventWithRules(db, eventId);
  return c.json(loaded);
});

adminGamification.delete('/events/:id', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const eventId = parseInt(c.req.param('id'), 10);
  if (isNaN(eventId)) return c.json({ error: 'Invalid event id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const existing = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).get();
  if (!existing) return c.json({ error: 'Event not found' }, 404);

  await db.delete(schema.eventWins).where(eq(schema.eventWins.eventId, eventId)).run();
  await db.delete(schema.eventParticipants).where(eq(schema.eventParticipants.eventId, eventId)).run();
  await db.delete(schema.eventRules).where(eq(schema.eventRules.eventId, eventId)).run();
  await db.delete(schema.events).where(eq(schema.events.id, eventId)).run();

  invalidateActiveEventsCache();
  return c.json({ success: true });
});

adminGamification.get('/users/:id', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const userId = parseInt(c.req.param('id'), 10);
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const data = await loadAdminUserGamification(db, userId);
  if (!data) return c.json({ error: 'User not found' }, 404);

  return c.json(data);
});

adminGamification.post('/users/:id/badges', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const userId = parseInt(c.req.param('id'), 10);
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = AdminAwardBadgeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const ok = await adminAwardBadge(db, userId, parsed.data.badgeId);
  if (!ok) return c.json({ error: 'User or badge not found' }, 404);

  const data = await loadAdminUserGamification(db, userId);
  return c.json(data ?? { success: true });
});

adminGamification.delete('/users/:id/badges/:badgeId', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const userId = parseInt(c.req.param('id'), 10);
  const badgeId = parseInt(c.req.param('badgeId'), 10);
  if (isNaN(userId) || isNaN(badgeId)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const ok = await adminRevokeBadge(db, userId, badgeId);
  if (!ok) return c.json({ error: 'Badge not earned by user' }, 404);

  const data = await loadAdminUserGamification(db, userId);
  return c.json(data ?? { success: true });
});

adminGamification.post('/maintenance/archive-ledger', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const db = drizzle(c.env.DB, { schema });
  const archived = await archiveOldLedgerRows(db);
  return c.json({ archived });
});

/**
 * Destructive, irreversible "fresh start" reset: wipes every user's points, level,
 * earned badges, points ledger, streaks, and event participation/wins. The admin's
 * configured badges, point rules, level thresholds, and events are left untouched.
 */
adminGamification.post('/maintenance/reset-progress', async (c) => {
  const auth = await requireAdmin(c);
  if ('error' in auth) return auth.error;

  const body = await c.req.json().catch(() => null);
  const parsed = ResetGamificationProgressSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Type RESET to confirm this action' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });

  const affectedRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.userGamification)
    .get();
  const usersAffected = affectedRow?.count ?? 0;

  await db.delete(schema.pointsLedger).run();
  await db.delete(schema.pointsLedgerArchive).run();
  await db.delete(schema.userBadges).run();
  await db.delete(schema.userStatCounters).run();
  await db.delete(schema.userStreaks).run();
  await db.delete(schema.eventParticipants).run();
  await db.delete(schema.eventWins).run();
  await db.delete(schema.userGamification).run();

  invalidateActiveEventsCache();

  return c.json({ success: true, usersAffected });
});

export default adminGamification;
