import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import { UpdateEquippedBadgesSchema, type MeBootstrap } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getFollowedUserIds, countPendingFollowRequests } from '../lib/follows';
import { getBlockedUserIds } from '../lib/blocks';
import { getMutedUserIds } from '../lib/mutes';
import { getOrCreateUserSettings } from '../lib/user-settings';
import { getSystemSettings } from '../lib/system-settings';
import { countUnreadNotifications } from '../lib/notifications';
import { countUnreadMessages } from '../lib/messages';
import { toGamificationPublic, toGamificationBlock, emptyGamificationPublic } from '../lib/gamification/public';
import { isGamificationEnabled, getGamificationVisibility } from '../lib/gamification/settings';
import { processUserActionSafe } from '../lib/gamification/hub';
import { setEquippedBadges } from '../lib/gamification/equipped';

const me = new Hono<{ Bindings: Env }>();

me.get('/bootstrap', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

  const gamificationEnabled = await isGamificationEnabled(db);

  if (gamificationEnabled) {
    await processUserActionSafe(
      db,
      c.env,
      authUser.id,
      'session_active',
      { source: 'bootstrap' },
      authUser.username,
    );
  }

  const [
    followingIds,
    blockedIds,
    mutedIds,
    userSettings,
    systemSettings,
    unreadNotifications,
    unreadMessages,
    pendingFollowRequests,
    gamification,
  ] = await Promise.all([
    getFollowedUserIds(db, authUser.id),
    getBlockedUserIds(db, authUser.id),
    getMutedUserIds(db, authUser.id),
    getOrCreateUserSettings(db, authUser.id),
    getSystemSettings(db),
    countUnreadNotifications(db, authUser.id),
    countUnreadMessages(db, authUser.id),
    countPendingFollowRequests(db, authUser.id),
    // Skip all gamification DB reads entirely when the feature is disabled.
    gamificationEnabled
      ? toGamificationPublic(db, authUser.id, { includeGoals: true })
      : Promise.resolve(null),
  ]);

  const payload: MeBootstrap = {
    followingIds,
    blockedIds,
    mutedIds,
    userSettings,
    systemSettings,
    counts: {
      unreadNotifications,
      unreadMessages,
      pendingFollowRequests,
    },
    gamificationEnabled,
    ...(gamificationEnabled && gamification ? { g: gamification } : {}),
  };

  return c.json(payload);
});

me.get('/gamification', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  if (!(await isGamificationEnabled(db))) {
    return c.json(emptyGamificationPublic());
  }
  const gamification = await toGamificationPublic(db, authUser.id);
  return c.json(gamification);
});

me.patch('/gamification/equipped', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const enabled = await isGamificationEnabled(db);
  if (!enabled) return c.json({ error: 'Gamification is disabled' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateEquippedBadgesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const summary = await db.select({ level: schema.userGamification.level })
    .from(schema.userGamification)
    .where(eq(schema.userGamification.userId, authUser.id))
    .get();

  const result = await setEquippedBadges(db, authUser.id, parsed.data.badgeIds, {
    role: authUser.role,
    level: summary?.level ?? 1,
  });

  if (!result.success) return c.json({ error: result.error }, 400);

  const gamification = await toGamificationPublic(db, authUser.id);
  return c.json(gamification);
});

me.post('/session-tick', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const enabled = await isGamificationEnabled(db);
  if (!enabled) {
    return c.json({ ok: true, skipped: true });
  }

  const body = await c.req.json().catch(() => ({}));
  const minutes = typeof body?.minutes === 'number' && body.minutes > 0
    ? Math.min(body.minutes, 5)
    : undefined;

  const gResult = await processUserActionSafe(
    db,
    c.env,
    authUser.id,
    'session_tick',
    minutes !== undefined ? { minutes } : {},
    authUser.username,
  );

  const g = toGamificationBlock(gResult, await getGamificationVisibility(db));
  return c.json(g ? { ok: true, g } : { ok: true });
});

export default me;
