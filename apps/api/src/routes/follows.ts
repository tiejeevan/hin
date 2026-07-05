import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { FollowListPage, FollowStatus } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  followUser,
  unfollowUser,
  cancelFollowRequest,
  approveFollowRequest,
  rejectFollowRequest,
  listPendingRequests,
  listFollowers,
  listFollowing,
  getFollowStatus,
  getFollowerCount,
  getFollowingCount,
  getFollowedUserIds,
} from '../lib/follows';

const follows = new Hono<{ Bindings: Env }>();

// Pending requests for auth user (register before /:userId)
follows.get('/requests', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const requests = await listPendingRequests(db, authUser.id);
  return c.json(requests);
});

follows.post('/requests/:userId/approve', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const requesterId = parseInt(c.req.param('userId'));
  if (isNaN(requesterId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await approveFollowRequest(db, c.env, authUser.id, requesterId, authUser.username);
  if (!result.ok) return c.json({ error: result.error }, result.code as 404);

  const followStatus = await getFollowStatus(db, authUser.id, requesterId);
  return c.json({ success: true, followStatus });
});

follows.post('/requests/:userId/reject', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const requesterId = parseInt(c.req.param('userId'));
  if (isNaN(requesterId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await rejectFollowRequest(db, authUser.id, requesterId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 404);

  return c.json({ success: true });
});

// Followed user IDs for feed filtering (register before /:userId)
follows.get('/following-ids', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const ids = await getFollowedUserIds(db, authUser.id);
  return c.json({ ids });
});

follows.get('/:userId/followers', async (c) => {
  const authUser = await getAuthUser(c);
  const userId = parseInt(c.req.param('userId'));
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const cursorParam = c.req.query('cursor');
  let cursor: number | null = null;
  if (cursorParam !== undefined && cursorParam !== '') {
    cursor = parseInt(cursorParam, 10);
    if (isNaN(cursor)) return c.json({ error: 'Invalid cursor' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const { users, nextCursor } = await listFollowers(db, authUser?.id ?? null, userId, cursor);
  const page: FollowListPage = { users, nextCursor };
  return c.json(page);
});

follows.get('/:userId/following', async (c) => {
  const authUser = await getAuthUser(c);
  const userId = parseInt(c.req.param('userId'));
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const cursorParam = c.req.query('cursor');
  let cursor: number | null = null;
  if (cursorParam !== undefined && cursorParam !== '') {
    cursor = parseInt(cursorParam, 10);
    if (isNaN(cursor)) return c.json({ error: 'Invalid cursor' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const { users, nextCursor } = await listFollowing(db, authUser?.id ?? null, userId, cursor);
  const page: FollowListPage = { users, nextCursor };
  return c.json(page);
});

follows.post('/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const targetId = parseInt(c.req.param('userId'));
  if (isNaN(targetId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await followUser(db, c.env, authUser.id, targetId, authUser.username);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);

  const followStatus: FollowStatus =
    result.result.status === 'following' ? 'following' : 'requested';

  return c.json({
    followStatus,
    followerCount: await getFollowerCount(db, targetId),
    followingCount: await getFollowingCount(db, targetId),
  });
});

follows.delete('/:userId/request', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const targetId = parseInt(c.req.param('userId'));
  if (isNaN(targetId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await cancelFollowRequest(db, authUser.id, targetId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400);

  const followStatus = await getFollowStatus(db, authUser.id, targetId);
  return c.json({ followStatus });
});

follows.delete('/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const targetId = parseInt(c.req.param('userId'));
  if (isNaN(targetId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await unfollowUser(db, authUser.id, targetId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400);

  const followStatus = await getFollowStatus(db, authUser.id, targetId);
  return c.json({
    followStatus,
    followerCount: await getFollowerCount(db, targetId),
  });
});

export default follows;
