import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { MuteListPage, MuteStatus } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  muteUser,
  unmuteUser,
  listMutedUsers,
  getMutedUserIds,
  getMuteStatus,
} from '../lib/mutes';

const mutes = new Hono<{ Bindings: Env }>();

mutes.get('/ids', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const ids = await getMutedUserIds(db, authUser.id);
  return c.json({ ids });
});

mutes.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const cursorParam = c.req.query('cursor');
  let cursor: number | null = null;
  if (cursorParam !== undefined && cursorParam !== '') {
    const parsed = parseInt(cursorParam);
    if (isNaN(parsed)) return c.json({ error: 'Invalid cursor' }, 400);
    cursor = parsed;
  }

  const db = drizzle(c.env.DB, { schema });
  const page = await listMutedUsers(db, authUser.id, cursor);
  return c.json(page satisfies MuteListPage);
});

mutes.post('/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const mutedId = parseInt(c.req.param('userId'));
  if (isNaN(mutedId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await muteUser(db, authUser.id, mutedId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);

  const muteStatus: MuteStatus = await getMuteStatus(db, authUser.id, mutedId);
  return c.json({ success: true, muteStatus });
});

mutes.delete('/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const mutedId = parseInt(c.req.param('userId'));
  if (isNaN(mutedId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await unmuteUser(db, authUser.id, mutedId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400);

  const muteStatus: MuteStatus = await getMuteStatus(db, authUser.id, mutedId);
  return c.json({ success: true, muteStatus });
});

export default mutes;
