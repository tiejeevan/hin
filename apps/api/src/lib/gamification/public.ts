import { eq, and, isNull, inArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { GamificationPublic, GamificationPublicBadge, GamificationPublicGoal, GamificationActionResult, GamificationActionBlock } from '@hin/types';
import type { drizzle } from 'drizzle-orm/d1';
import { getUserCounters } from './counters';
import { loadLevelConfig, levelFromPoints, pointsToNextLevel } from './points';
import { getEquippedBadgesForUser, getMaxEquippedBadges } from './equipped';
import { getGamificationVisibility, type GamificationVisibility } from './settings';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface GamificationPublicOptions {
  /** Include unearned badge progress — only for the authenticated user viewing their own data. */
  includeGoals?: boolean;
}

/**
 * Inert gamification payload used when gamification is globally disabled.
 * Contains no user data and triggers zero DB reads, while keeping the DTO
 * shape valid for clients.
 */
export function emptyGamificationPublic(): GamificationPublic {
  return {
    badges: [],
    goalsInProgress: [],
    equippedBadges: [],
    maxEquippedBadges: 0,
  };
}

/** Strip internal fields — safe for web clients. */
export async function toGamificationPublic(
  db: Db,
  userId: number,
  options: GamificationPublicOptions = {},
): Promise<GamificationPublic> {
  const includeGoals = options.includeGoals ?? true;
  const visibility = await getGamificationVisibility(db);
  const [summary, counters, earnedRows, levelRows, activeRules, user, equippedBadges] = await Promise.all([
    db.select({
      totalPoints: schema.userGamification.totalPoints,
      level: schema.userGamification.level,
    })
      .from(schema.userGamification)
      .where(eq(schema.userGamification.userId, userId))
      .get(),
    getUserCounters(db, userId),
    db.select({
      badgeId: schema.userBadges.badgeId,
      earnedAt: schema.userBadges.earnedAt,
    })
      .from(schema.userBadges)
      .where(eq(schema.userBadges.userId, userId))
      .all(),
    loadLevelConfig(db),
    db.select({
      badgeId: schema.badgeRules.badgeId,
      metricKey: schema.badgeRules.metricKey,
      operator: schema.badgeRules.operator,
      threshold: schema.badgeRules.threshold,
      name: schema.badges.name,
      description: schema.badges.description,
    })
      .from(schema.badgeRules)
      .innerJoin(schema.badges, eq(schema.badgeRules.badgeId, schema.badges.id))
      .where(
        and(
          eq(schema.badges.isActive, 1),
          isNull(schema.badges.deletedAt),
        ),
      )
      .all(),
    db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId)).get(),
    getEquippedBadgesForUser(db, userId),
  ]);

  const totalPoints = summary?.totalPoints ?? 0;
  const level = summary?.level ?? levelFromPoints(totalPoints, levelRows);
  const earnedIds = new Set(earnedRows.map((r) => r.badgeId));
  const maxEquippedBadges = await getMaxEquippedBadges(db, level, user?.role ?? 'user');

  let badges: GamificationPublicBadge[] = [];
  if (earnedRows.length > 0) {
    const badgeMeta = await db
      .select({
        id: schema.badges.id,
        name: schema.badges.name,
        description: schema.badges.description,
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
          description: meta.description,
          imageUrl: meta.imageUrl,
          earnedAt: row.earnedAt,
        };
      })
      .filter((b): b is GamificationPublicBadge => b !== null);
  }

  const goalsInProgress: GamificationPublicGoal[] = includeGoals
    ? activeRules
      .filter((rule) => !earnedIds.has(rule.badgeId))
      .map((rule) => ({
        badgeId: rule.badgeId,
        name: rule.name,
        description: rule.description,
        current: counters[rule.metricKey] ?? 0,
        target: rule.threshold,
      }))
    : [];

  return {
    // Level/points still accrue server-side; they're only omitted from the DTO
    // when the admin has hidden them globally.
    ...(visibility.showLevel ? { level } : {}),
    ...(visibility.showPoints ? { totalPoints } : {}),
    ...(visibility.showLevel && visibility.showPoints
      ? { pointsToNextLevel: pointsToNextLevel(totalPoints, level, levelRows) }
      : {}),
    badges,
    goalsInProgress,
    equippedBadges,
    maxEquippedBadges,
  };
}

export function toGamificationBlock(
  result: GamificationActionResult,
  visibility: GamificationVisibility,
): GamificationActionBlock | undefined {
  if (result.skipped) return undefined;
  const block: GamificationActionBlock = {};
  if (visibility.showPoints) {
    block.pe = result.pointsEarned;
    block.pt = result.totalPoints;
  }
  if (visibility.showLevel) {
    block.lv = result.level;
  }
  if (result.badgesEarned.length > 0) {
    block.be = result.badgesEarned;
  }
  // Nothing visible and no badges → nothing worth sending.
  if (
    block.pe === undefined &&
    block.pt === undefined &&
    block.lv === undefined &&
    block.be === undefined
  ) {
    return undefined;
  }
  return block;
}
