import { eq, desc, and, isNull, inArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { AdminUserGamification } from '@hin/types';
import type { drizzle } from 'drizzle-orm/d1';
import { getUserCounters } from './counters';
import { getMetricCatalog } from './registry';
import { isInternalCounterKey } from './abuse';
import { getUserGamificationSummary } from './points';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const LEDGER_PREVIEW_LIMIT = 50;

export async function loadAdminUserGamification(
  db: Db,
  userId: number,
): Promise<AdminUserGamification | null> {
  const user = await db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) return null;

  const [summary, counters, earnedRows, ledgerRows] = await Promise.all([
    getUserGamificationSummary(db, userId),
    getUserCounters(db, userId),
    db
      .select({
        badgeId: schema.userBadges.badgeId,
        earnedAt: schema.userBadges.earnedAt,
      })
      .from(schema.userBadges)
      .where(eq(schema.userBadges.userId, userId))
      .all(),
    db
      .select({
        actionType: schema.pointsLedger.actionType,
        delta: schema.pointsLedger.delta,
        createdAt: schema.pointsLedger.createdAt,
      })
      .from(schema.pointsLedger)
      .where(eq(schema.pointsLedger.userId, userId))
      .orderBy(desc(schema.pointsLedger.createdAt))
      .limit(LEDGER_PREVIEW_LIMIT)
      .all(),
  ]);

  const catalog = getMetricCatalog();
  const labelByKey = new Map(catalog.metrics.map((m) => [m.key, m.label]));

  const counterEntries = Object.entries(counters)
    .filter(([key]) => !isInternalCounterKey(key))
    .map(([key, value]) => ({
      label: labelByKey.get(key) ?? key,
      value,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  let badges: AdminUserGamification['badges'] = [];
  if (earnedRows.length > 0) {
    const badgeMeta = await db
      .select({
        id: schema.badges.id,
        name: schema.badges.name,
        imageUrl: schema.badges.imageUrl,
      })
      .from(schema.badges)
      .where(inArray(schema.badges.id, earnedRows.map((r) => r.badgeId)))
      .all();

    const metaById = new Map(badgeMeta.map((b) => [b.id, b]));
    badges = earnedRows
      .map((row) => {
        const meta = metaById.get(row.badgeId);
        if (!meta) return null;
        return {
          id: meta.id,
          name: meta.name,
          imageUrl: meta.imageUrl,
          earnedAt: row.earnedAt,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }

  return {
    userId: user.id,
    username: user.username,
    level: summary.level,
    totalPoints: summary.totalPoints,
    counters: counterEntries,
    badges,
    recentLedger: ledgerRows.map((r) => ({
      actionType: r.actionType,
      delta: r.delta,
      createdAt: r.createdAt,
    })),
  };
}

export async function adminAwardBadge(
  db: Db,
  userId: number,
  badgeId: number,
): Promise<boolean> {
  const user = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return false;

  const badge = await db
    .select({ id: schema.badges.id })
    .from(schema.badges)
    .where(and(eq(schema.badges.id, badgeId), isNull(schema.badges.deletedAt)))
    .get();
  if (!badge) return false;

  await db
    .insert(schema.userBadges)
    .values({ userId, badgeId })
    .onConflictDoNothing()
    .run();

  return true;
}

export async function adminRevokeBadge(
  db: Db,
  userId: number,
  badgeId: number,
): Promise<boolean> {
  const result = await db
    .delete(schema.userBadges)
    .where(
      and(
        eq(schema.userBadges.userId, userId),
        eq(schema.userBadges.badgeId, badgeId),
      ),
    )
    .run();

  return (result.meta?.changes ?? 0) > 0;
}
