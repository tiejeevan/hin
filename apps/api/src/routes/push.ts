import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import { PushSubscribeSchema, PushUnsubscribeSchema } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { sendWebPushToSubscription } from '../lib/push';

const push = new Hono<{ Bindings: Env }>();

push.get('/vapid-public-key', (c) => {
  const publicKey = c.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return c.json({ error: 'Push is not configured' }, 503);
  }
  return c.json({ publicKey });
});

push.post('/subscribe', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = PushSubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const now = new Date().toISOString();
  const { endpoint, keys, userAgent } = parsed.data;

  const existing = await db.select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint))
    .get();

  if (existing) {
    await db.update(schema.pushSubscriptions)
      .set({
        userId: authUser.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? existing.userAgent,
        updatedAt: now,
      })
      .where(eq(schema.pushSubscriptions.id, existing.id))
      .run();
  } else {
    await db.insert(schema.pushSubscriptions).values({
      userId: authUser.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  return c.json({ ok: true });
});

push.delete('/subscribe', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = PushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  await db.delete(schema.pushSubscriptions)
    .where(and(
      eq(schema.pushSubscriptions.userId, authUser.id),
      eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint),
    ))
    .run();

  return c.json({ ok: true });
});

/** Authenticated test push for smoke / manual verification. */
push.post('/test', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  if (!c.env.VAPID_PUBLIC_KEY || !c.env.VAPID_PRIVATE_KEY) {
    return c.json({ error: 'Push is not configured' }, 503);
  }

  const db = drizzle(c.env.DB, { schema });
  const subs = await db.select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, authUser.id))
    .all();

  if (subs.length === 0) {
    return c.json({ error: 'No push subscriptions for this user' }, 404);
  }

  let sent = 0;
  for (const sub of subs) {
    const result = await sendWebPushToSubscription(c.env, sub, {
      title: 'Hin test',
      body: 'Push notifications are working.',
      url: '/',
    });
    if (result.gone) {
      await db.delete(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.id, sub.id))
        .run();
    } else if (result.ok) {
      sent += 1;
    }
  }

  return c.json({ ok: true, sent });
});

export default push;
