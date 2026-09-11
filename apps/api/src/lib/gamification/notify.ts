import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { GamificationRewardPayload, Notification } from '@hin/types';
import type { Env } from '../../types';
import { getOrCreateUserSettings, isNotificationEnabled } from '../user-settings';
import { sendWebPushForNotification } from '../push';
import {
  broadcastNotification,
  broadcastUserEvent,
  deferBroadcast,
  type RealtimeScheduler,
} from '../realtime';

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function dispatchNotification(
  env: Env,
  db: Db,
  recipientId: number,
  notification: Notification,
  scheduler?: RealtimeScheduler,
): Promise<void> {
  deferBroadcast(scheduler, broadcastNotification(env, recipientId, notification));
  deferBroadcast(scheduler, sendWebPushForNotification(env, db, notification));
}

export async function broadcastGamificationReward(
  env: Env,
  userId: number,
  payload: GamificationRewardPayload,
  scheduler?: RealtimeScheduler,
): Promise<void> {
  deferBroadcast(
    scheduler,
    broadcastUserEvent(env, userId, {
      type: 'gamification_reward',
      payload,
    }),
  );
}

export async function notifyBadgeAwards(
  db: Db,
  env: Env,
  userId: number,
  badgeIds: number[],
  senderUsername: string,
  scheduler?: RealtimeScheduler,
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
      category: 'gamification',
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
      category: 'gamification',
      read: false,
      createdAt: notif.createdAt,
    };

    await dispatchNotification(env, db, userId, payload, scheduler);
  }
}

export async function notifyLevelUp(
  db: Db,
  env: Env,
  userId: number,
  level: number,
  senderUsername: string,
  scheduler?: RealtimeScheduler,
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
    category: 'gamification',
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
    category: 'gamification',
    read: false,
    createdAt: notif.createdAt,
  };

  await dispatchNotification(env, db, userId, payload, scheduler);
}

export async function notifyEventWins(
  db: Db,
  env: Env,
  userId: number,
  eventIds: number[],
  senderUsername: string,
  scheduler?: RealtimeScheduler,
): Promise<void> {
  if (eventIds.length === 0) return;

  const settings = await getOrCreateUserSettings(db, userId);
  if (!isNotificationEnabled(settings, 'event_win')) return;

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
      type: 'event_win',
      entityType: 'event',
      entityId: event.id,
      category: 'gamification',
      content,
      read: 0,
    }).returning();

    const payload: Notification = {
      id: notif.id,
      userId,
      senderId: userId,
      senderUsername,
      type: 'event_win',
      entityType: 'event',
      entityId: event.id,
      commentId: null,
      content,
      category: 'gamification',
      read: false,
      createdAt: notif.createdAt,
    };

    await dispatchNotification(env, db, userId, payload, scheduler);
    await broadcastGamificationReward(env, userId, {
      pt: 0,
      lv: 1,
      eventWin: { eventId: event.id, eventName: event.name },
    }, scheduler);
  }
}
