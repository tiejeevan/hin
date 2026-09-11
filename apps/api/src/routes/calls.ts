import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { VideoCallActionSchema, VideoCallInviteSchema } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  VideoCallDomainError,
  acceptVideoCall,
  cancelVideoCall,
  declineVideoCall,
  endVideoCall,
  getActiveCallForUser,
  inviteVideoCall,
} from '../lib/video-calls';

const calls = new Hono<{ Bindings: Env }>();

calls.get('/active', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const session = await getActiveCallForUser(db, c.env, authUser.id);
  return c.json({ call: session });
});

calls.post('/invite', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallInviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const call = await inviteVideoCall(
      db,
      c.env,
      authUser.id,
      parsed.data.calleeUserId,
      parsed.data.callType,
    );
    return c.json({ call });
  } catch (err) {
    if (err instanceof VideoCallDomainError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  }
});

calls.post('/accept', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    const call = await acceptVideoCall(db, c.env, authUser.id, parsed.data.callId);
    return c.json({ call });
  } catch (err) {
    if (err instanceof VideoCallDomainError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  }
});

calls.post('/decline', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    await declineVideoCall(db, c.env, authUser.id, parsed.data.callId);
    return c.json({ success: true });
  } catch (err) {
    if (err instanceof VideoCallDomainError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  }
});

calls.post('/cancel', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const reason = (body as { reason?: string } | null)?.reason === 'missed' ? 'missed' : 'cancelled';

  const db = drizzle(c.env.DB, { schema });
  try {
    await cancelVideoCall(db, c.env, authUser.id, parsed.data.callId, reason);
    return c.json({ success: true });
  } catch (err) {
    if (err instanceof VideoCallDomainError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  }
});

calls.post('/end', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VideoCallActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  try {
    await endVideoCall(db, c.env, authUser.id, parsed.data.callId);
    return c.json({ success: true });
  } catch (err) {
    if (err instanceof VideoCallDomainError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  }
});

export default calls;
