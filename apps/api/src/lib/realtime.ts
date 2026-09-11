import type { Notification } from '@hin/types';
import type { Env } from '../types';

export type RealtimeScheduler = Pick<ExecutionContext, 'waitUntil'>;

function getRealtimeStub(env: Env) {
  const doId = env.REALTIME_DO.idFromName('global');
  return env.REALTIME_DO.get(doId);
}

/** Run realtime fan-out after the HTTP response is sent. */
export function deferBroadcast(scheduler: RealtimeScheduler | undefined, task: Promise<unknown>): void {
  if (scheduler) {
    scheduler.waitUntil(task);
  } else {
    void task.catch(() => {});
  }
}

/**
 * Broadcasts an event to every connected WebSocket client via the global
 * Realtime Durable Object. Fire-and-forget: never throws to the caller.
 */
export async function broadcastEvent(env: Env, message: object): Promise<void> {
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }),
    );
  } catch (_e) {}
}

/** @deprecated Use broadcastEvent — kept for existing imports. */
export async function broadcastToAll(env: Env, message: object): Promise<void> {
  return broadcastEvent(env, message);
}

export async function broadcastNotification(
  env: Env,
  recipientId: number,
  notification: Notification,
): Promise<void> {
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, notification }),
      }),
    );
  } catch (_e) {}
}

export async function broadcastUserEvent(
  env: Env,
  recipientId: number,
  event: object,
): Promise<void> {
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-user-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, ...event }),
      }),
    );
  } catch (_e) {}
}

export async function broadcastReadStatus(
  env: Env,
  senderId: number,
  receiverId: number,
  readAt: string,
): Promise<void> {
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-read-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId, receiverId, readAt }),
      }),
    );
  } catch (_e) {}
}

export async function broadcastMessageDelivered(
  env: Env,
  recipientId: number,
  messageIds: number[],
  deliveredAt: string,
): Promise<void> {
  if (messageIds.length === 0) return;
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-message-delivered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, messageIds, deliveredAt }),
      }),
    );
  } catch (_e) {}
}

export async function broadcastNotificationsBatch(
  env: Env,
  notifications: Notification[],
): Promise<void> {
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-notifications-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications }),
      }),
    );
  } catch (_e) {}
}

export async function broadcastSystemToast(env: Env, content: string): Promise<void> {
  try {
    const doStub = getRealtimeStub(env);
    await doStub.fetch(
      new Request('http://realtime/broadcast-system-toast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
    );
  } catch (_e) {}
}
