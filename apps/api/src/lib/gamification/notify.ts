import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { GamificationRewardPayload, Notification } from '@hin/types';
import type { Env } from '../../types';
import { getOrCreateUserSettings, isNotificationEnabled } from '../user-settings';

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function broadcastNotification(env: Env, recipientId: number, notification: Notification) {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, notification }),
    }));
  } catch (_e) {}
}

export async function broadcastGamificationReward(
  env: Env,
  userId: number,
  payload: GamificationRewardPayload,
): Promise<void> {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-user-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientId: userId,
        type: 'gamification_reward',
        payload,
      }),
    }));
  } catch (_e) {}
}

export async function notifyBadgeAwards(
  db: Db,
  env: Env,
  userId: number,
  badgeIds: number[],
  senderUsername: string,
): Promise<void> {
  if (badgeIds.length === 0) return;

  const settings = await getOrCreateUserSettings(db, userId);
  if (!isNotificationEnabled(settings, 'badge_award')) return;

  const badges = await db
    .select({ id: schema.badges.id, name: schema.badges.name })
    .from(schema.badges)
    .where(inArray(schema.badges.id, badgeIds))
    .all();

  for (const badge of badges) {
    const content = `You earned the "${badge.name}" badge!`;
    const [notif] = await db.insert(schema.notifications).values({
      userId,
      senderId: userId,
      type: 'badge_award',
      entityType: 'badge',
      entityId: badge.id,
      content,
      read: 0,
    }).returning();

    const payload: Notification = {
      id: notif.id,
      userId,
      senderId: userId,
      senderUsername,
      type: 'badge_award',
      entityType: 'badge',
      entityId: badge.id,
      commentId: null,
      content,
      read: false,
      createdAt: notif.createdAt,
    };

    await broadcastNotification(env, userId, payload);
  }
}

export async function notifyLevelUp(
  db: Db,
  env: Env,
  userId: number,
  level: number,
  senderUsername: string,
): Promise<void> {
  const settings = await getOrCreateUserSettings(db, userId);
  if (!isNotificationEnabled(settings, 'level_up')) return;

  const content = `You reached Level ${level}!`;
  const [notif] = await db.insert(schema.notifications).values({
    userId,
    senderId: userId,
    type: 'level_up',
    entityType: 'system',
    entityId: 0,
    content,
    read: 0,
  }).returning();

  const payload: Notification = {
    id: notif.id,
    userId,
    senderId: userId,
    senderUsername,
    type: 'level_up',
    entityType: 'system',
    entityId: 0,
    commentId: null,
    content,
    read: false,
    createdAt: notif.createdAt,
  };

  await broadcastNotification(env, userId, payload);
}

export async function notifyEventWins(
  db: Db,
  env: Env,
  userId: number,
  eventIds: number[],
  senderUsername: string,
): Promise<void> {
  if (eventIds.length === 0) return;

  const settings = await getOrCreateUserSettings(db, userId);
  if (!isNotificationEnabled(settings, 'system')) return;

  const events = await db
    .select({ id: schema.events.id, name: schema.events.name })
    .from(schema.events)
    .where(inArray(schema.events.id, eventIds))
    .all();

  for (const event of events) {
    const content = `You won "${event.name}"!`;
    const [notif] = await db.insert(schema.notifications).values({
      userId,
      senderId: userId,
      type: 'system',
      entityType: 'system',
      entityId: event.id,
      content,
      read: 0,
    }).returning();

    const payload: Notification = {
      id: notif.id,
      userId,
      senderId: userId,
      senderUsername,
      type: 'system',
      entityType: 'system',
      entityId: event.id,
      commentId: null,
      content,
      read: false,
      createdAt: notif.createdAt,
    };

    await broadcastNotification(env, userId, payload);

    await broadcastGamificationReward(env, userId, {
      pt: 0,
      lv: 1,
      eventWin: { eventId: event.id, eventName: event.name },
    });
  }
}
