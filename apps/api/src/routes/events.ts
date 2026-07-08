import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { EventLeaderboard, PublicEvent } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getActiveEvents } from '../lib/gamification/events/cache';
import { isGamificationEnabled } from '../lib/gamification/settings';
import { loadEquippedBadgesForUsers } from '../lib/gamification/equipped';

const events = new Hono<{ Bindings: Env }>();

events.get('/active', async (c) => {
  const authUser = await getAuthUser(c);
  const db = drizzle(c.env.DB, { schema });
  const active = await getActiveEvents(db);

  const joinedIds = new Set<number>();
  const scores = new Map<number, number>();
  if (authUser) {
    const participants = await db
      .select({
        eventId: schema.eventParticipants.eventId,
        score: schema.eventParticipants.score,
      })
      .from(schema.eventParticipants)
      .where(eq(schema.eventParticipants.userId, authUser.id))
      .all();
    for (const p of participants) {
      joinedIds.add(p.eventId);
      scores.set(p.eventId, p.score);
    }
  }

  const result: PublicEvent[] = active.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    status: e.status as PublicEvent['status'],
    bannerUrl: e.bannerUrl,
    requiresOptIn: e.requiresOptIn,
    joined: joinedIds.has(e.id),
    myScore: scores.get(e.id),
    rules: e.rules.map((r) => ({ metricKey: r.metricKey, winType: r.winType })),
  }));

  return c.json({ events: result });
});

events.post('/:id/join', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const eventId = parseInt(c.req.param('id'), 10);
  if (isNaN(eventId)) return c.json({ error: 'Invalid event id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const active = await getActiveEvents(db);
  const event = active.find((e) => e.id === eventId);
  if (!event) return c.json({ error: 'Event not active' }, 404);

  await db.insert(schema.eventParticipants).values({
    eventId,
    userId: authUser.id,
    score: 0,
  }).onConflictDoNothing().run();

  return c.json({ success: true, eventId });
});

events.get('/:id/leaderboard', async (c) => {
  const authUser = await getAuthUser(c);
  const eventId = parseInt(c.req.param('id'), 10);
  if (isNaN(eventId)) return c.json({ error: 'Invalid event id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const event = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).get();
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const rows = await db
    .select({
      userId: schema.eventParticipants.userId,
      score: schema.eventParticipants.score,
      username: schema.users.username,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.users, eq(schema.eventParticipants.userId, schema.users.id))
    .where(eq(schema.eventParticipants.eventId, eventId))
    .orderBy(desc(schema.eventParticipants.score))
    .limit(50)
    .all();

  let myRank: number | null = null;
  let myScore: number | null = null;
  if (authUser) {
    const idx = rows.findIndex((r) => r.userId === authUser.id);
    if (idx >= 0) {
      myRank = idx + 1;
      myScore = rows[idx].score;
    }
  }

  const equippedBadgesByUser = (await isGamificationEnabled(db))
    ? await loadEquippedBadgesForUsers(db, rows.map((r) => r.userId))
    : new Map();

  const payload: EventLeaderboard = {
    eventId,
    entries: rows.map((r, i) => ({
      userId: r.userId,
      username: r.username,
      score: r.score,
      rank: i + 1,
      equippedBadges: equippedBadgesByUser.get(r.userId) ?? [],
    })),
    myRank,
    myScore,
  };

  return c.json(payload);
});

export default events;
