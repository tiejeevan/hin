import { eq, and, lte, gte } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { EventRuleConfig, EventWinType } from '@hin/types';
import type { drizzle } from 'drizzle-orm/d1';
import { finalizeEndedEvents } from './winners';
import { maybeArchiveLedger } from '../archival';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface CachedEventRule {
  id: number;
  eventId: number;
  metricKey: string;
  winType: EventWinType;
  config: EventRuleConfig;
}

export interface CachedEvent {
  id: number;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: string;
  bannerUrl: string | null;
  requiresOptIn: boolean;
  rules: CachedEventRule[];
}

let activeEventsCache: { events: CachedEvent[]; fetchedAt: number } | null = null;
const EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateActiveEventsCache(): void {
  activeEventsCache = null;
}

export async function getActiveEvents(db: Db): Promise<CachedEvent[]> {
  const now = Date.now();
  if (activeEventsCache && now - activeEventsCache.fetchedAt < EVENTS_CACHE_TTL_MS) {
    return activeEventsCache.events;
  }

  await finalizeEndedEvents(db);
  await maybeArchiveLedger(db);

  const nowIso = new Date().toISOString();
  const eventRows = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.status, 'active'),
        lte(schema.events.startsAt, nowIso),
        gte(schema.events.endsAt, nowIso),
      ),
    )
    .all();

  if (eventRows.length === 0) {
    activeEventsCache = { events: [], fetchedAt: now };
    return [];
  }

  const eventIds = eventRows.map((e) => e.id);
  const allRules = await Promise.all(
    eventIds.map((eventId) =>
      db.select().from(schema.eventRules).where(eq(schema.eventRules.eventId, eventId)).all(),
    ),
  );

  const rulesByEvent = new Map<number, CachedEventRule[]>();
  for (let i = 0; i < eventIds.length; i++) {
    rulesByEvent.set(
      eventIds[i],
      allRules[i].map((r) => ({
        id: r.id,
        eventId: r.eventId,
        metricKey: r.metricKey,
        winType: r.winType as EventWinType,
        config: JSON.parse(r.config) as EventRuleConfig,
      })),
    );
  }

  const events: CachedEvent[] = eventRows.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    status: e.status,
    bannerUrl: e.bannerUrl,
    requiresOptIn: e.requiresOptIn === 1,
    rules: rulesByEvent.get(e.id) ?? [],
  }));

  activeEventsCache = { events, fetchedAt: now };
  return events;
}
