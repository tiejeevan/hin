import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getSystemSettings } from '../lib/system-settings';

const settings = new Hono<{ Bindings: Env }>();

/** Public, unauthenticated flags needed before login (e.g. whether Olabid nav should appear). */
settings.get('/public', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const systemSettings = await getSystemSettings(db);
  return c.json({
    olabidEnabled: systemSettings.olabidEnabled,
    presenceEnabled: systemSettings.presenceEnabled,
  });
});

settings.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const systemSettings = await getSystemSettings(db);
  return c.json(systemSettings);
});

export default settings;
