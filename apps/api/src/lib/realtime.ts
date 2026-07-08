import type { Env } from '../types';

/**
 * Broadcasts an event to every connected WebSocket client via the global
 * Realtime Durable Object. Fire-and-forget: never throws to the caller.
 */
export async function broadcastToAll(env: Env, message: object): Promise<void> {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      }),
    );
  } catch (_e) {}
}
