import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { TrendingHashtagsPage } from '@hin/types';
import type { Env } from '../types';
import { getTrendingHashtags } from '../lib/hashtags';

const hashtags = new Hono<{ Bindings: Env }>();

const DEFAULT_TRENDING_LIMIT = 10;
const MAX_TRENDING_LIMIT = 25;
const DEFAULT_WINDOW_HOURS = 24 * 7;
const WINDOW_HOURS_BY_KEY: Record<string, number> = {
  '24h': 24,
  '7d': 24 * 7,
};

hashtags.get('/trending', async (c) => {
  const db = drizzle(c.env.DB, { schema });

  const windowParam = c.req.query('window');
  const windowHours = windowParam ? WINDOW_HOURS_BY_KEY[windowParam] : undefined;
  if (windowParam && windowHours === undefined) {
    return c.json({ error: 'Invalid window (expected 24h or 7d)' }, 400);
  }

  const limitParam = c.req.query('limit');
  let limit = DEFAULT_TRENDING_LIMIT;
  if (limitParam !== undefined) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) return c.json({ error: 'Invalid limit' }, 400);
    limit = Math.min(parsed, MAX_TRENDING_LIMIT);
  }

  const hashtags = await getTrendingHashtags(db, {
    windowHours: windowHours ?? DEFAULT_WINDOW_HOURS,
    limit,
  });

  return c.json({ hashtags } satisfies TrendingHashtagsPage);
});

export default hashtags;
