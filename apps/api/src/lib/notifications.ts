import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, ne } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Notification } from '@hin/types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export function resolveNotificationEntityType(
  notif: { entityType: string | null; type: string },
): Notification['entityType'] {
  if (
    notif.entityType === 'post' ||
    notif.entityType === 'message' ||
    notif.entityType === 'system' ||
    notif.entityType === 'user'
  ) {
    return notif.entityType;
  }
  if (notif.type === 'message') return 'message';
  if (notif.type === 'system') return 'system';
  if (
    notif.type === 'follow' ||
    notif.type === 'follow_request' ||
    notif.type === 'follow_accepted'
  ) {
    return 'user';
  }
  return 'post';
}

/** Unread non-message notifications (matches client bell badge). */
export async function countUnreadNotifications(db: Db, userId: number): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.read, 0),
        ne(schema.notifications.type, 'message'),
      ),
    )
    .get();
  return res?.value || 0;
}
