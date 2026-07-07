import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { MeBootstrap } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getFollowedUserIds, countPendingFollowRequests } from '../lib/follows';
import { getBlockedUserIds } from '../lib/blocks';
import { getMutedUserIds } from '../lib/mutes';
import { getOrCreateUserSettings } from '../lib/user-settings';
import { getSystemSettings } from '../lib/system-settings';
import { countUnreadNotifications } from '../lib/notifications';
import { countUnreadMessages } from '../lib/messages';
import { toGamificationPublic, toGamificationBlock } from '../lib/gamification/public';
import { isGamificationEnabled } from '../lib/gamification/settings';
import { processUserActionSafe } from '../lib/gamification/hub';

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
    toGamificationPublic(db, authUser.id, { includeGoals: true }),
  ]);

  const hasGamificationData =
    gamification.badges.length > 0
    || gamification.totalPoints > 0
    || gamification.level > 1
    || gamification.goalsInProgress.length > 0;

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
    ...(gamificationEnabled || hasGamificationData ? { g: gamification } : {}),
  };

  return c.json(payload);
});

me.get('/gamification', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
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

  const g = toGamificationBlock(gResult);
  return c.json(g ? { ok: true, g } : { ok: true });
});

export default me;
