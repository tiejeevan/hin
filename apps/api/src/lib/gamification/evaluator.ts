import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { BadgeRuleDefinition } from '@hin/types';
import type { GamificationTx } from './counters';
import { getUserCounters } from './counters';

export function compareMetric(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>=':
      return value >= threshold;
    case '>':
      return value > threshold;
    case '==':
    case '=':
      return value === threshold;
    case '<=':
      return value <= threshold;
    case '<':
      return value < threshold;
    default:
      return value >= threshold;
  }
}

/**
 * Pure rule evaluation — unit-testable without DB.
 * Idempotent: badges already in `alreadyEarned` are skipped.
 */
export function evaluateBadgeRules(
  counters: Record<string, number>,
  rules: BadgeRuleDefinition[],
  alreadyEarned: Set<number>,
): number[] {
  const newlyEarned: number[] = [];

  for (const rule of rules) {
    if (alreadyEarned.has(rule.badgeId)) continue;

    const value = counters[rule.metricKey] ?? 0;
    if (compareMetric(value, rule.operator, rule.threshold)) {
      newlyEarned.push(rule.badgeId);
      alreadyEarned.add(rule.badgeId);
    }
  }

  return newlyEarned;
}

export async function loadActiveBadgeRules(tx: GamificationTx): Promise<BadgeRuleDefinition[]> {
  const rows = await tx
    .select({
      badgeId: schema.badgeRules.badgeId,
      metricKey: schema.badgeRules.metricKey,
      operator: schema.badgeRules.operator,
      threshold: schema.badgeRules.threshold,
    })
    .from(schema.badgeRules)
    .innerJoin(schema.badges, eq(schema.badgeRules.badgeId, schema.badges.id))
    .where(
      and(
        eq(schema.badges.isActive, 1),
        isNull(schema.badges.deletedAt),
      ),
    )
    .all();

  return rows;
}

export async function loadEarnedBadgeIds(tx: GamificationTx, userId: number): Promise<Set<number>> {
  const rows = await tx
    .select({ badgeId: schema.userBadges.badgeId })
    .from(schema.userBadges)
    .where(eq(schema.userBadges.userId, userId))
    .all();

  return new Set(rows.map((r) => r.badgeId));
}

async function persistNewBadges(
  tx: GamificationTx,
  userId: number,
  badgeIds: number[],
): Promise<void> {
  for (const badgeId of badgeIds) {
    await tx
      .insert(schema.userBadges)
      .values({ userId, badgeId })
      .onConflictDoNothing()
      .run();
  }
}

/**
 * Evaluate active badge rules for a user and persist awards to user_badges.
 */
export async function evaluateBadgesForUser(
  tx: GamificationTx,
  userId: number,
  alreadyEarned?: Set<number>,
): Promise<number[]> {
  const earnedSet = alreadyEarned ?? await loadEarnedBadgeIds(tx, userId);

  const [rules, counters] = await Promise.all([
    loadActiveBadgeRules(tx),
    getUserCounters(tx, userId),
  ]);

  const newlyEarned = evaluateBadgeRules(counters, rules, earnedSet);
  if (newlyEarned.length > 0) {
    await persistNewBadges(tx, userId, newlyEarned);
  }

  return newlyEarned;
}
