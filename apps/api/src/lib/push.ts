import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Notification } from '@hin/types';
import {
  buildPushPayload,
  type PushSubscription as WebPushSubscription,
  type VapidKeys,
} from '@block65/webcrypto-web-push';
import type { Env } from '../types';
import { getOrCreateUserSettings } from './user-settings';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  notificationId?: number;
  type?: string;
}

export function notificationDeepLink(n: {
  type: string;
  entityType?: string | null;
  entityId?: number | null;
  senderId?: number | null;
}): string {
  if (n.type === 'follow' || n.type === 'follow_request' || n.type === 'follow_accepted') {
    return n.senderId ? `/profile/${n.senderId}` : '/';
  }
  if (n.type === 'message') {
    return n.senderId ? `/messages/${n.senderId}` : '/';
  }
  if (n.entityType === 'user' && n.entityId) {
    return `/profile/${n.entityId}`;
  }
  if (n.entityId) {
    return `/posts/${n.entityId}`;
  }
  return '/';
}

export function pushCopyForNotification(n: Notification): PushPayload {
  const body = n.content || 'New notification';
  let title = 'Hin';
  switch (n.type) {
    case 'like':
      title = 'New like';
      break;
    case 'comment':
      title = 'New comment';
      break;
    case 'mention':
      title = 'Mention';
      break;
    case 'follow':
    case 'follow_request':
      title = 'New follower';
      break;
    case 'follow_accepted':
      title = 'Follow accepted';
      break;
    case 'system':
      title = 'Announcement';
      break;
    case 'badge_award':
      title = 'Badge earned';
      break;
    case 'level_up':
      title = 'Level up';
      break;
    case 'event_win':
      title = 'Event win';
      break;
    default:
      title = 'Hin';
  }
  return {
    title,
    body,
    url: notificationDeepLink(n),
    notificationId: n.id,
    type: n.type,
  };
}

function vapidFromEnv(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    subject: env.VAPID_SUBJECT || 'mailto:noreply@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
}

export async function sendWebPushToSubscription(
  env: Env,
  sub: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload,
): Promise<{ ok: boolean; gone?: boolean; status?: number }> {
  const vapid = vapidFromEnv(env);
  if (!vapid) return { ok: false };

  const subscription: WebPushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  try {
    const built = await buildPushPayload(
      {
        data: JSON.stringify(payload),
        options: { ttl: 60 * 60 },
      },
      subscription,
      vapid,
    );

    const res = await fetch(sub.endpoint, built);
    if (res.status === 404 || res.status === 410) {
      return { ok: false, gone: true, status: res.status };
    }
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error('[push] send failed', err);
    return { ok: false };
  }
}

/**
 * After D1 insert + DO broadcast: send Web Push if master + type prefs allow.
 * Block/mute should already have gated the notification insert.
 */
export async function sendWebPushForNotification(
  env: Env,
  db: Db,
  notification: Notification,
): Promise<void> {
  const vapid = vapidFromEnv(env);
  if (!vapid) return;

  try {
    const settings = await getOrCreateUserSettings(db, notification.userId);
    if (!settings.notifyPushEnabled) return;

    const subs = await db.select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userId, notification.userId))
      .all();

    if (subs.length === 0) return;

    const payload = pushCopyForNotification(notification);

    for (const sub of subs) {
      const result = await sendWebPushToSubscription(env, sub, payload);
      if (result.gone) {
        await db.delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, sub.id))
          .run();
      }
    }
  } catch (err) {
    console.error('[push] fanout failed', err);
  }
}

/** Chunked fanout for admin broadcasts (many recipients). */
export async function sendWebPushBatch(
  env: Env,
  db: Db,
  notifications: Notification[],
  chunkSize = 25,
): Promise<void> {
  for (let i = 0; i < notifications.length; i += chunkSize) {
    const chunk = notifications.slice(i, i + chunkSize);
    await Promise.all(chunk.map((n) => sendWebPushForNotification(env, db, n)));
  }
}
