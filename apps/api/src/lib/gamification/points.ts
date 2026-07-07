import { eq, asc } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { GamificationActionType } from '@hin/types';
import type { GamificationTx } from './counters';
import { capPointDelta } from './abuse';

export interface PointsAwardResult {
  pointsEarned: number;
  totalPoints: number;
  level: number;
  levelUp: number | null;
}

async function ensureUserGamificationRow(tx: GamificationTx, userId: number) {
  const existing = await tx
    .select()
    .from(schema.userGamification)
    .where(eq(schema.userGamification.userId, userId))
    .get();

  if (existing) return existing;

  await tx.insert(schema.userGamification).values({ userId }).run();
  return tx
    .select()
    .from(schema.userGamification)
    .where(eq(schema.userGamification.userId, userId))
    .get();
}

async function getPointDelta(
  tx: GamificationTx,
  action: GamificationActionType,
): Promise<number> {
  const rule = await tx
    .select({ points: schema.pointRules.points, isActive: schema.pointRules.isActive })
    .from(schema.pointRules)
    .where(eq(schema.pointRules.actionType, action))
    .get();

  if (!rule || rule.isActive !== 1) return 0;
  return rule.points;
}

export async function loadLevelConfig(tx: GamificationTx): Promise<{ level: number; minPoints: number }[]> {
  return tx
    .select({
      level: schema.levelConfig.level,
      minPoints: schema.levelConfig.minPoints,
    })
    .from(schema.levelConfig)
    .orderBy(asc(schema.levelConfig.level))
    .all();
}

export function levelFromPoints(
  totalPoints: number,
  levels: { level: number; minPoints: number }[],
): number {
  if (levels.length === 0) return 1;

  let result = levels[0].level;
  for (const entry of levels) {
    if (totalPoints >= entry.minPoints) {
      result = entry.level;
    }
  }
  return result;
}

export function pointsToNextLevel(
  totalPoints: number,
  currentLevel: number,
  levels: { level: number; minPoints: number }[],
): number | null {
  const next = levels.find((l) => l.level > currentLevel);
  if (!next) return null;
  return Math.max(0, next.minPoints - totalPoints);
}

export async function awardPointsForAction(
  tx: GamificationTx,
  userId: number,
  action: GamificationActionType,
  metadata: Record<string, unknown>,
): Promise<PointsAwardResult> {
  const delta = await getPointDelta(tx, action);
  const row = await ensureUserGamificationRow(tx, userId);
  const previousLevel = row?.level ?? 1;
  const previousPoints = row?.totalPoints ?? 0;

  if (delta === 0) {
    return {
      pointsEarned: 0,
      totalPoints: previousPoints,
      level: previousLevel,
      levelUp: null,
    };
  }

  const cappedDelta = await capPointDelta(tx, userId, delta);
  if (cappedDelta === 0) {
    return {
      pointsEarned: 0,
      totalPoints: previousPoints,
      level: previousLevel,
      levelUp: null,
    };
  }

  const totalPoints = previousPoints + cappedDelta;

  await tx.insert(schema.pointsLedger).values({
    userId,
    actionType: action,
    delta: cappedDelta,
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
  }).run();

  const levels = await loadLevelConfig(tx);
  const level = levelFromPoints(totalPoints, levels);
  const levelUp = level > previousLevel ? level : null;

  await tx
    .update(schema.userGamification)
    .set({
      totalPoints,
      level,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.userGamification.userId, userId))
    .run();

  return { pointsEarned: cappedDelta, totalPoints, level, levelUp };
}

export async function getUserGamificationSummary(
  tx: GamificationTx,
  userId: number,
): Promise<{ totalPoints: number; level: number }> {
  const row = await tx
    .select({
      totalPoints: schema.userGamification.totalPoints,
      level: schema.userGamification.level,
    })
    .from(schema.userGamification)
    .where(eq(schema.userGamification.userId, userId))
    .get();

  return {
    totalPoints: row?.totalPoints ?? 0,
    level: row?.level ?? 1,
  };
}
