import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import {
  VideoCallAllowlistAddSchema,
  VideoCallAllowlistSearchQuerySchema,
  VideoCallsSettingsSchema,
} from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { broadcastEvent, deferBroadcast } from '../lib/realtime';
import { getSystemSettings, updateSystemSettings } from '../lib/system-settings';
import {
  VideoCallDomainError,
  addUserToVideoCallAllowlist,
  listVideoCallAllowlist,
  removeUserFromVideoCallAllowlist,
  searchUsersForVideoCallAllowlist,
} from '../lib/video-calls';

const adminVideoCalls = new Hono<{ Bindings: Env }>();

adminVideoCalls.get('/settings', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  const settings = await getSystemSettings(db);
  return c.json({ videoCallsEnabled: settings.videoCallsEnabled });
});

adminVideoCalls.patch('/settings', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallsSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const systemSettings = await updateSystemSettings(db, {
    videoCallsEnabled: parsed.data.videoCallsEnabled,
  });

  deferBroadcast(c.executionCtx, broadcastEvent(c.env, {
    type: 'system_settings_changed',
    payload: { settings: systemSettings },
  }));

  return c.json({ videoCallsEnabled: systemSettings.videoCallsEnabled });
});

adminVideoCalls.get('/users/search', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const parsed = VideoCallAllowlistSearchQuerySchema.safeParse({ q: c.req.query('q') ?? '' });
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const results = await searchUsersForVideoCallAllowlist(db, parsed.data.q);
  return c.json({ results });
});

adminVideoCalls.get('/allowlist', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  const entries = await listVideoCallAllowlist(db);
  return c.json({ entries });
});

adminVideoCalls.post('/allowlist', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallAllowlistAddSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const entry = await addUserToVideoCallAllowlist(db, authUser.id, parsed.data);
    return c.json({ entry });
  } catch (err) {
    if (err instanceof VideoCallDomainError) {
      return c.json({ error: err.message }, err.status as 400);
    }
    throw err;
  }
});

adminVideoCalls.delete('/allowlist/:userId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = Number(c.req.param('userId'));
  if (!Number.isInteger(userId) || userId <= 0) {
    return c.json({ error: 'Invalid user id' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  await removeUserFromVideoCallAllowlist(db, userId);
  return c.json({ success: true });
});

export default adminVideoCalls;
