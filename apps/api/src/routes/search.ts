import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { searchUsers, searchPosts, searchHashtags, searchMentions } from '../lib/search';

const search = new Hono<{ Bindings: Env }>();

search.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q');
  if (!q || q.trim().length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }

  const queryStr = q.trim();
  const type = c.req.query('type') || 'all';

  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');

  let limit = 20;
  if (limitParam !== undefined) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      limit = Math.min(parsed, 100);
    }
  }

  let offset = 0;
  if (offsetParam !== undefined) {
    const parsed = parseInt(offsetParam, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  const db = drizzle(c.env.DB, { schema });
  const viewerId = authUser.id;

  if (type === 'users') {
    const results = await searchUsers(db, queryStr, viewerId, limit + 1, offset);
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    return c.json({ users: items, posts: [], hashtags: [], mentions: [], hasMore });
  }

  if (type === 'posts') {
    const results = await searchPosts(db, queryStr, viewerId, limit + 1, offset);
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    return c.json({ users: [], posts: items, hashtags: [], mentions: [], hasMore });
  }

  if (type === 'hashtags') {
    const results = await searchHashtags(db, queryStr, limit + 1, offset);
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    return c.json({ users: [], posts: [], hashtags: items, mentions: [], hasMore });
  }

  if (type === 'mentions') {
    const results = await searchMentions(db, queryStr, viewerId, limit + 1, offset);
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    return c.json({ users: [], posts: [], hashtags: [], mentions: items, hasMore });
  }

  // default type = 'all'
  const [users, posts, hashtags, mentions] = await Promise.all([
    searchUsers(db, queryStr, viewerId, limit, offset),
    searchPosts(db, queryStr, viewerId, limit, offset),
    searchHashtags(db, queryStr, limit, offset),
    searchMentions(db, queryStr, viewerId, limit, offset),
  ]);

  return c.json({
    users,
    posts,
    hashtags,
    mentions,
    hasMore: false,
  });
});

export default search;
