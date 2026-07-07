import { eq, and, desc } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { EventPrizeType, EventRuleConfig } from '@hin/types';
import type { drizzle } from 'drizzle-orm/d1';
import type { GamificationTx } from '../counters';
import type { CounterDelta } from '../registry';
import { getActiveEvents } from './cache';
import { checkImmediateWin, type EventWinRecord } from './winners';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function evaluateEventsForAction(
  db: Db,
  tx: GamificationTx,
  userId: number,
  deltas: CounterDelta[],
): Promise<EventWinRecord[]> {
  if (deltas.length === 0) return [];

  const activeEvents = await getActiveEvents(db);
  if (activeEvents.length === 0) return [];

  const deltaByMetric = new Map<string, number>();
  for (const d of deltas) {
    if (d.userId !== userId) continue;
    deltaByMetric.set(d.metricKey, (deltaByMetric.get(d.metricKey) ?? 0) + d.delta);
  }

  if (deltaByMetric.size === 0) return [];

  const wins: EventWinRecord[] = [];

  for (const event of activeEvents) {
    const participant = await tx
      .select()
      .from(schema.eventParticipants)
      .where(
        and(
          eq(schema.eventParticipants.eventId, event.id),
          eq(schema.eventParticipants.userId, userId),
        ),
      )
      .get();

    if (!participant) continue;

    let scoreDelta = 0;
    for (const rule of event.rules) {
      const delta = deltaByMetric.get(rule.metricKey);
      if (delta && delta > 0) {
        scoreDelta += delta;
      }
    }

    if (scoreDelta === 0) continue;

    const newScore = participant.score + scoreDelta;
    await tx
      .update(schema.eventParticipants)
      .set({ score: newScore })
      .where(
        and(
          eq(schema.eventParticipants.eventId, event.id),
          eq(schema.eventParticipants.userId, userId),
        ),
      )
      .run();

    for (const rule of event.rules) {
      if (rule.winType === 'leaderboard' || rule.winType === 'raffle') continue;
      const delta = deltaByMetric.get(rule.metricKey);
      if (!delta || delta <= 0) continue;

      const win = await checkImmediateWin(
        tx,
        event.id,
        event.name,
        userId,
        newScore,
        rule.winType,
        rule.config,
      );
      if (win) wins.push(win);
    }
  }

  return wins;
}
