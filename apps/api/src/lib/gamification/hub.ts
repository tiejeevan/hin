import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { GamificationActionResult, GamificationActionType } from '@hin/types';
import type { Env } from '../../types';
import { isGamificationEnabled, getGamificationVisibility } from './settings';
import { resolveActionDeltas } from './registry';
import { upsertCounterDelta } from './counters';
import { evaluateBadgesForUser } from './evaluator';
import { awardPointsForAction, getUserGamificationSummary } from './points';
import { notifyBadgeAwards, notifyLevelUp, notifyEventWins, broadcastGamificationReward } from './notify';
import { evaluateEventsForAction } from './events/evaluator';
import { checkActionRateLimit } from './abuse';
import './handlers';

type Db = ReturnType<typeof drizzle<typeof schema>>;
/** D1 session — same surface as a transaction callback arg; also the root drizzle db handle. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface ProcessUserActionOptions {
  env?: Env;
  senderUsername?: string;
}

async function runPipeline(
  db: Db,
  tx: Tx,
  userId: number,
  action: GamificationActionType,
  metadata: Record<string, unknown>,
): Promise<GamificationActionResult> {
  const rateCheck = await checkActionRateLimit(tx, userId, action);
  if (rateCheck.blocked) {
    const summary = await getUserGamificationSummary(tx, userId);
    return {
      skipped: false,
      pointsEarned: 0,
      totalPoints: summary.totalPoints,
      level: summary.level,
      levelUp: null,
      badgesEarned: [],
      eventWins: [],
    };
  }

  const deltas = await resolveActionDeltas({
    tx,
    userId,
    action,
    metadata,
  });

  for (const delta of deltas) {
    await upsertCounterDelta(tx, delta.userId, delta.metricKey, delta.delta);
  }

  const pointsResult = await awardPointsForAction(tx, userId, action, metadata);
  const badgesEarned = await evaluateBadgesForUser(tx, userId);
  const eventWins = await evaluateEventsForAction(db, tx, userId, deltas);

  return {
    skipped: false,
    pointsEarned: pointsResult.pointsEarned,
    totalPoints: pointsResult.totalPoints,
    level: pointsResult.level,
    levelUp: pointsResult.levelUp,
    badgesEarned,
    eventWins: eventWins.map((w) => w.eventId),
  };
}

/**
 * Single entry point for all gamification side effects.
 * When gamification_enabled is false: immediate return, zero gamification D1 writes.
 */
export async function processUserAction(
  db: Db,
  userId: number,
  action: GamificationActionType,
  metadata: Record<string, unknown> = {},
  options: ProcessUserActionOptions = {},
): Promise<GamificationActionResult> {
  const enabled = await isGamificationEnabled(db);
  if (!enabled) {
    return {
      skipped: true,
      pointsEarned: 0,
      totalPoints: 0,
      level: 1,
      levelUp: null,
      badgesEarned: [],
    };
  }

  // D1 local dev rejects drizzle's BEGIN TRANSACTION wrapper; pipeline steps use
  // atomic upserts (counters, badges) so sequential execution is safe here.
  const result = await runPipeline(db, db as unknown as Tx, userId, action, metadata);

  if (options.env) {
    const username = options.senderUsername ?? 'Hin';
    const { showLevel, showPoints } = await getGamificationVisibility(db);
    if (result.badgesEarned.length > 0) {
      await notifyBadgeAwards(db, options.env, userId, result.badgesEarned, username);
    }
    // Level-up notifications only make sense when the level is visible.
    if (result.levelUp !== null && showLevel) {
      await notifyLevelUp(db, options.env, userId, result.levelUp, username);
    }
    if (result.eventWins && result.eventWins.length > 0) {
      await notifyEventWins(db, options.env, userId, result.eventWins, username);
    }
    if (
      result.pointsEarned > 0
      || result.badgesEarned.length > 0
      || result.levelUp !== null
      || (result.eventWins && result.eventWins.length > 0)
    ) {
      await broadcastGamificationReward(options.env, userId, {
        ...(showPoints ? { pe: result.pointsEarned, pt: result.totalPoints } : {}),
        ...(showLevel ? { lv: result.level, levelUp: result.levelUp } : {}),
        be: result.badgesEarned.length > 0 ? result.badgesEarned : undefined,
      });
    }
  }

  return result;
}

/**
 * Runs gamification after primary write; never throws to the route caller.
 */
export async function processUserActionSafe(
  db: Db,
  env: Env | undefined,
  userId: number,
  action: GamificationActionType,
  metadata: Record<string, unknown> = {},
  senderUsername?: string,
): Promise<GamificationActionResult> {
  try {
    return await processUserAction(db, userId, action, metadata, { env, senderUsername });
  } catch (err) {
    console.error('gamification pipeline failed', { userId, action, err });
    return {
      skipped: true,
      pointsEarned: 0,
      totalPoints: 0,
      level: 1,
      levelUp: null,
      badgesEarned: [],
    };
  }
}

/**
 * Runs the gamification pipeline inside an existing transaction.
 * Use when the route wraps primary + gamification writes together (Hardening §3).
 */
export async function runGamificationPipeline(
  db: Db,
  tx: Tx,
  userId: number,
  action: GamificationActionType,
  metadata: Record<string, unknown> = {},
): Promise<GamificationActionResult> {
  return runPipeline(db, tx, userId, action, metadata);
}
