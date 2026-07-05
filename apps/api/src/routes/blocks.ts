import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { BlockListPage, BlockStatus } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  blockUser,
  unblockUser,
  listBlockedUsers,
  getBlockedUserIds,
  getBlockStatus,
} from '../lib/blocks';

const blocks = new Hono<{ Bindings: Env }>();

blocks.get('/ids', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const ids = await getBlockedUserIds(db, authUser.id);
  return c.json({ ids });
});

blocks.get('/', async (c) => {
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
  const page = await listBlockedUsers(db, authUser.id, cursor);
  return c.json(page satisfies BlockListPage);
});

blocks.post('/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const blockedId = parseInt(c.req.param('userId'));
  if (isNaN(blockedId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await blockUser(db, c.env, authUser.id, blockedId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);

  const blockStatus: BlockStatus = await getBlockStatus(db, authUser.id, blockedId);
  return c.json({ success: true, blockStatus });
});

blocks.delete('/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const blockedId = parseInt(c.req.param('userId'));
  if (isNaN(blockedId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await unblockUser(db, authUser.id, blockedId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400);

  const blockStatus: BlockStatus = await getBlockStatus(db, authUser.id, blockedId);
  return c.json({ success: true, blockStatus });
});

export default blocks;
