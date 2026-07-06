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

const me = new Hono<{ Bindings: Env }>();

me.get('/bootstrap', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

  const [
    followingIds,
    blockedIds,
    mutedIds,
    userSettings,
    systemSettings,
    unreadNotifications,
    unreadMessages,
    pendingFollowRequests,
  ] = await Promise.all([
    getFollowedUserIds(db, authUser.id),
    getBlockedUserIds(db, authUser.id),
    getMutedUserIds(db, authUser.id),
    getOrCreateUserSettings(db, authUser.id),
    getSystemSettings(db),
    countUnreadNotifications(db, authUser.id),
    countUnreadMessages(db, authUser.id),
    countPendingFollowRequests(db, authUser.id),
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
  };

  return c.json(payload);
});

export default me;
