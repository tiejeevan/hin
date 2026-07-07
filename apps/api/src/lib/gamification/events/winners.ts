import { eq, and, lte, desc, count } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { EventPrizeType, EventRuleConfig } from '@hin/types';
import type { drizzle } from 'drizzle-orm/d1';
import type { GamificationTx } from '../counters';
import { invalidateActiveEventsCache } from './cache';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface EventWinRecord {
  eventId: number;
  eventName: string;
  userId: number;
  prizeType: EventPrizeType;
  prizeRef: string | null;
}

async function hasEventWin(
  tx: GamificationTx,
  eventId: number,
  userId: number,
): Promise<boolean> {
  const row = await tx
    .select({ id: schema.eventWins.id })
    .from(schema.eventWins)
    .where(and(eq(schema.eventWins.eventId, eventId), eq(schema.eventWins.userId, userId)))
    .get();
  return !!row;
}

async function countEventWins(tx: GamificationTx, eventId: number): Promise<number> {
  const res = await tx
    .select({ value: count() })
    .from(schema.eventWins)
    .where(eq(schema.eventWins.eventId, eventId))
    .get();
  return res?.value ?? 0;
}

async function awardPrize(
  tx: GamificationTx,
  userId: number,
  prizeType: EventPrizeType,
  prizeRef: string | null | undefined,
): Promise<void> {
  if (prizeType === 'badge' && prizeRef) {
    const badgeId = parseInt(prizeRef, 10);
    if (!Number.isNaN(badgeId)) {
      await tx.insert(schema.userBadges).values({ userId, badgeId }).onConflictDoNothing().run();
    }
    return;
  }

  if (prizeType === 'points' && prizeRef) {
    const points = parseInt(prizeRef, 10);
    if (Number.isNaN(points) || points <= 0) return;

    const row = await tx
      .select()
      .from(schema.userGamification)
      .where(eq(schema.userGamification.userId, userId))
      .get();

    const previousPoints = row?.totalPoints ?? 0;
    const totalPoints = previousPoints + points;

    if (!row) {
      await tx.insert(schema.userGamification).values({ userId, totalPoints, level: 1 }).run();
    } else {
      await tx
        .update(schema.userGamification)
        .set({ totalPoints, updatedAt: new Date().toISOString() })
        .where(eq(schema.userGamification.userId, userId))
        .run();
    }

    await tx.insert(schema.pointsLedger).values({
      userId,
      actionType: 'event_win',
      delta: points,
      metadata: JSON.stringify({ prizeRef }),
    }).run();
  }
}

export async function recordEventWin(
  tx: GamificationTx,
  eventId: number,
  eventName: string,
  userId: number,
  prizeType: EventPrizeType,
  prizeRef: string | null | undefined,
): Promise<EventWinRecord | null> {
  if (await hasEventWin(tx, eventId, userId)) return null;

  await tx.insert(schema.eventWins).values({
    eventId,
    userId,
    prizeType,
    prizeRef: prizeRef ?? null,
  }).run();

  await awardPrize(tx, userId, prizeType, prizeRef);

  return { eventId, eventName, userId, prizeType, prizeRef: prizeRef ?? null };
}

export async function checkImmediateWin(
  tx: GamificationTx,
  eventId: number,
  eventName: string,
  userId: number,
  score: number,
  winType: string,
  config: EventRuleConfig,
): Promise<EventWinRecord | null> {
  const threshold = config.threshold ?? 0;

  if (winType === 'threshold' && score >= threshold) {
    return recordEventWin(tx, eventId, eventName, userId, config.prizeType, config.prizeRef);
  }

  if (winType === 'first_to_n' && score >= threshold) {
    const maxWinners = config.count ?? 1;
    const existing = await countEventWins(tx, eventId);
    if (existing < maxWinners) {
      return recordEventWin(tx, eventId, eventName, userId, config.prizeType, config.prizeRef);
    }
  }

  return null;
}

export async function finalizeLeaderboardForEvent(
  tx: GamificationTx,
  eventId: number,
  eventName: string,
  topN: number,
  config: EventRuleConfig,
): Promise<EventWinRecord[]> {
  const participants = await tx
    .select({
      userId: schema.eventParticipants.userId,
      score: schema.eventParticipants.score,
    })
    .from(schema.eventParticipants)
    .where(eq(schema.eventParticipants.eventId, eventId))
    .orderBy(desc(schema.eventParticipants.score))
    .limit(topN)
    .all();

  const wins: EventWinRecord[] = [];
  for (const p of participants) {
    if (p.score <= 0) continue;
    const win = await recordEventWin(
      tx,
      eventId,
      eventName,
      p.userId,
      config.prizeType,
      config.prizeRef,
    );
    if (win) wins.push(win);
  }
  return wins;
}

export async function finalizeRaffleForEvent(
  tx: GamificationTx,
  eventId: number,
  eventName: string,
  winnerCount: number,
  config: EventRuleConfig,
): Promise<EventWinRecord[]> {
  const participants = await tx
    .select({
      userId: schema.eventParticipants.userId,
      score: schema.eventParticipants.score,
    })
    .from(schema.eventParticipants)
    .where(eq(schema.eventParticipants.eventId, eventId))
    .all();

  const eligible = participants.filter((p) => p.score > 0);
  if (eligible.length === 0) return [];

  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const picks = shuffled.slice(0, Math.max(1, winnerCount));
  const wins: EventWinRecord[] = [];
  for (const p of picks) {
    const win = await recordEventWin(
      tx,
      eventId,
      eventName,
      p.userId,
      config.prizeType,
      config.prizeRef,
    );
    if (win) wins.push(win);
  }
  return wins;
}

/** Mark active events past ends_at as ended and compute winners. */
export async function finalizeEndedEvents(db: Db): Promise<void> {
  const nowIso = new Date().toISOString();
  const toEnd = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.status, 'active'), lte(schema.events.endsAt, nowIso)))
    .all();

  if (toEnd.length === 0) return;

  for (const event of toEnd) {
    const rules = await db
      .select()
      .from(schema.eventRules)
      .where(eq(schema.eventRules.eventId, event.id))
      .all();

    for (const rule of rules) {
      const config = JSON.parse(rule.config) as EventRuleConfig;
      // D1 local dev rejects drizzle's BEGIN TRANSACTION wrapper; steps use atomic upserts.
      const tx = db as unknown as GamificationTx;
      if (rule.winType === 'leaderboard') {
        const topN = config.topN ?? 5;
        await finalizeLeaderboardForEvent(tx, event.id, event.name, topN, config);
      } else if (rule.winType === 'raffle') {
        const winnerCount = config.count ?? 1;
        await finalizeRaffleForEvent(tx, event.id, event.name, winnerCount, config);
      }
    }

    await db
      .update(schema.events)
      .set({ status: 'ended' })
      .where(eq(schema.events.id, event.id))
      .run();
  }

  invalidateActiveEventsCache();
}
