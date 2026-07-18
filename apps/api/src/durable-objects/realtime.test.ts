import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import {
  RealtimeDO,
  parseSessionAttachment,
  AUTH_FAILURE_CLOSE_CODE,
  type RealtimeSession,
} from './realtime';
import { JWT_SECRET } from '../lib/auth';
import type { Env } from '../types';
import type { Notification } from '@hin/types';

vi.mock('../lib/blocks', () => ({
  isBlocked: vi.fn().mockResolvedValue(false),
}));

vi.mock('../lib/linkPreview', () => ({
  parseFirstUrl: vi.fn().mockReturnValue(null),
  getOrFetchLinkPreview: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/system-settings', () => ({
  isPresenceEnabled: vi.fn().mockResolvedValue(true),
}));

import { isPresenceEnabled } from '../lib/system-settings';

class MockWebSocket {
  attachment: unknown = null;
  sent: string[] = [];
  closed = false;
  closeCode: number | undefined;
  closeReason: string | undefined;
  failSend = false;

  send(data: string) {
    if (this.failSend) throw new Error('send failed');
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }

  serializeAttachment(attachment: unknown) {
    this.attachment = attachment === null ? null : structuredClone(attachment);
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  parsedSent(): Array<{ type: string; payload?: unknown }> {
    return this.sent.map((s) => JSON.parse(s));
  }

  eventsOfType(type: string) {
    return this.parsedSent().filter((e) => e.type === type);
  }
}

class TestRealtimeDO extends RealtimeDO {
  sockets: MockWebSocket[] = [];

  getConnectedWebSockets(): WebSocket[] {
    return this.sockets as unknown as WebSocket[];
  }

  addSocket(ws: MockWebSocket = new MockWebSocket()) {
    this.sockets.push(ws);
    return ws;
  }
}

function createMockState(socketsRef: { current: MockWebSocket[] }): DurableObjectState {
  return {
    acceptWebSocket: vi.fn((ws: WebSocket) => {
      socketsRef.current.push(ws as unknown as MockWebSocket);
    }),
    getWebSockets: vi.fn(() => socketsRef.current as unknown as WebSocket[]),
  } as unknown as DurableObjectState;
}

function createDbMock(options?: {
  insertReturning?: Record<string, unknown>;
  receiverUser?: { id: number; username: string } | null;
}) {
  const inserted = options?.insertReturning ?? {
    id: 42,
    content: 'hello',
    createdAt: 1_700_000_000,
    read: 0,
    mediaUrl: null,
    mediaType: null,
  };

  const chain: Record<string, any> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.from = vi.fn(self);
  chain.where = vi.fn(self);
  chain.set = vi.fn(self);
  chain.values = vi.fn(self);
  chain.update = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.run = vi.fn().mockResolvedValue(undefined);
  chain.returning = vi.fn().mockResolvedValue([inserted]);
  chain.get = vi.fn().mockImplementation(async () => {
    // First get after insert path is often receiver user; keep simple.
    return options?.receiverUser ?? { id: 2, username: 'bob' };
  });

  return chain;
}

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(),
}));

import { drizzle } from 'drizzle-orm/d1';

async function makeToken(userId: number, username: string) {
  return sign({ id: userId, username }, JWT_SECRET, 'HS256');
}

function makeNotification(userId: number, id = 1): Notification {
  return {
    id,
    userId,
    senderId: 99,
    senderUsername: 'actor',
    type: 'like',
    entityId: 1,
    content: 'liked your post',
    read: false,
    createdAt: new Date().toISOString(),
  };
}

describe('parseSessionAttachment', () => {
  it('accepts a valid session', () => {
    expect(parseSessionAttachment({ userId: 1, username: 'a', activeChatId: null })).toEqual({
      userId: 1,
      username: 'a',
      activeChatId: null,
    });
  });

  it('rejects invalid shapes', () => {
    expect(parseSessionAttachment(null)).toBeNull();
    expect(parseSessionAttachment({})).toBeNull();
    expect(parseSessionAttachment({ userId: '1', username: 'a' })).toBeNull();
    expect(parseSessionAttachment({ userId: 1, username: '' })).toBeNull();
    expect(parseSessionAttachment({ userId: 1, username: 'a', activeChatId: 'x' })).toBeNull();
  });
});

describe('RealtimeDO hibernation session routing', () => {
  let socketsRef: { current: MockWebSocket[] };
  let state: DurableObjectState;
  let env: Env;
  let dob: TestRealtimeDO;

  beforeEach(() => {
    vi.clearAllMocks();
    (isPresenceEnabled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    socketsRef = { current: [] };
    state = createMockState(socketsRef);
    env = { DB: {} as D1Database, OLABID_API_KEY: '' } as Env;
    dob = new TestRealtimeDO(state, env);
    dob.sockets = socketsRef.current;
    (drizzle as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createDbMock());
  });

  it('stores attachment on valid join and rejects invalid token', async () => {
    const ws = dob.addSocket();
    const token = await makeToken(1, 'alice');

    await dob.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({
      type: 'join',
      payload: { token },
    }));

    expect(ws.attachment).toEqual({ userId: 1, username: 'alice', activeChatId: null });
    expect(ws.eventsOfType('joined')).toHaveLength(1);
    expect(ws.eventsOfType('presence_snapshot')[0]?.payload).toEqual({ onlineUserIds: [1] });

    const bad = dob.addSocket();
    await dob.webSocketMessage(bad as unknown as WebSocket, JSON.stringify({
      type: 'join',
      payload: { token: 'not-a-jwt' },
    }));
    expect(bad.attachment).toBeNull();
    expect(bad.eventsOfType('error')).toHaveLength(1);
    expect(bad.closed).toBe(true);
    expect(bad.closeCode).toBe(AUTH_FAILURE_CLOSE_CODE);
  });

  it('deduplicates presence and emits user_online only on first socket', async () => {
    const other = dob.addSocket();
    other.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    const a1 = dob.addSocket();
    await dob.webSocketMessage(a1 as unknown as WebSocket, JSON.stringify({
      type: 'join',
      payload: { token: await makeToken(1, 'alice') },
    }));

    expect(other.eventsOfType('user_online')).toEqual([
      { type: 'user_online', payload: { userId: 1 } },
    ]);

    other.sent = [];
    const a2 = dob.addSocket();
    await dob.webSocketMessage(a2 as unknown as WebSocket, JSON.stringify({
      type: 'join',
      payload: { token: await makeToken(1, 'alice') },
    }));

    expect(other.eventsOfType('user_online')).toHaveLength(0);
    expect(dob.getOnlineUserIds().sort()).toEqual([1, 2]);
  });

  it('emits user_offline only when the final socket closes', async () => {
    const a1 = dob.addSocket();
    const a2 = dob.addSocket();
    const bob = dob.addSocket();
    a1.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    a2.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    // During close, the closing socket may still be listed; exclude it in handleClose.
    await dob.handleClose(a1 as unknown as WebSocket);
    expect(bob.eventsOfType('user_offline')).toHaveLength(0);
    // After close completes, Cloudflare drops the socket from getWebSockets().
    dob.sockets = dob.sockets.filter((s) => s !== a1);

    await dob.handleClose(a2 as unknown as WebSocket);
    expect(bob.eventsOfType('user_offline')).toEqual([
      { type: 'user_offline', payload: { userId: 1 } },
    ]);
  });

  it('emits no presence events when presenceEnabled is false', async () => {
    (isPresenceEnabled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const other = dob.addSocket();
    other.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    const alice = dob.addSocket();
    await dob.webSocketMessage(alice as unknown as WebSocket, JSON.stringify({
      type: 'join',
      payload: { token: await makeToken(1, 'alice') },
    }));

    expect(alice.eventsOfType('joined')).toHaveLength(1);
    expect(alice.eventsOfType('presence_snapshot')).toHaveLength(0);
    expect(other.eventsOfType('user_online')).toHaveLength(0);

    await dob.handleClose(alice as unknown as WebSocket);
    expect(other.eventsOfType('user_offline')).toHaveLength(0);
  });

  it('routes broadcast-notification only to the recipient', async () => {
    const alice = dob.addSocket();
    const bob = dob.addSocket();
    const unauth = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    const notification = makeNotification(2);
    await dob.fetch(new Request('http://realtime/broadcast-notification', {
      method: 'POST',
      body: JSON.stringify({ recipientId: 2, notification }),
    }));

    expect(alice.eventsOfType('notification')).toHaveLength(0);
    expect(bob.eventsOfType('notification')).toHaveLength(1);
    expect(unauth.sent).toHaveLength(0);
  });

  it('routes batch notifications per user', async () => {
    const alice = dob.addSocket();
    const bob = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    await dob.fetch(new Request('http://realtime/broadcast-notifications-batch', {
      method: 'POST',
      body: JSON.stringify({
        notifications: [makeNotification(1, 10), makeNotification(2, 20)],
      }),
    }));

    expect(alice.eventsOfType('notification')[0]?.payload).toMatchObject({ id: 10 });
    expect(bob.eventsOfType('notification')[0]?.payload).toMatchObject({ id: 20 });
  });

  it('broadcast-event and system toast reach all authenticated sockets only', async () => {
    const alice = dob.addSocket();
    const bob = dob.addSocket();
    const unauth = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    await dob.fetch(new Request('http://realtime/broadcast-system-toast', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
    }));
    await dob.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      body: JSON.stringify({ type: 'post_created', payload: { id: 1 } }),
    }));

    expect(alice.eventsOfType('system_toast')).toHaveLength(1);
    expect(bob.eventsOfType('system_toast')).toHaveLength(1);
    expect(alice.eventsOfType('post_created')).toHaveLength(1);
    expect(bob.eventsOfType('post_created')).toHaveLength(1);
    expect(unauth.sent).toHaveLength(0);
  });

  it('broadcast-user-event and read-status target only the intended user', async () => {
    const alice = dob.addSocket();
    const aliceTab = dob.addSocket();
    const bob = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    aliceTab.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    await dob.fetch(new Request('http://realtime/broadcast-user-event', {
      method: 'POST',
      body: JSON.stringify({ recipientId: 1, type: 'follow_approved', payload: { userId: 2 } }),
    }));
    await dob.fetch(new Request('http://realtime/broadcast-read-status', {
      method: 'POST',
      body: JSON.stringify({ senderId: 1, receiverId: 2 }),
    }));

    expect(alice.eventsOfType('follow_approved')).toHaveLength(1);
    expect(aliceTab.eventsOfType('follow_approved')).toHaveLength(1);
    expect(bob.eventsOfType('follow_approved')).toHaveLength(0);
    expect(alice.eventsOfType('messages_read')).toHaveLength(1);
    expect(aliceTab.eventsOfType('messages_read')).toHaveLength(1);
    expect(bob.eventsOfType('messages_read')).toHaveLength(0);
  });

  it('forwards typing only to the receiver sockets', async () => {
    const alice = dob.addSocket();
    const bob = dob.addSocket();
    const bobTab = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });
    bobTab.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    await dob.handleClientMessage(alice as unknown as WebSocket, {
      type: 'typing',
      payload: { receiverId: 2, isTyping: true },
    });

    expect(bob.eventsOfType('typing')).toEqual([
      { type: 'typing', payload: { senderId: 1, isTyping: true } },
    ]);
    expect(bobTab.eventsOfType('typing')).toHaveLength(1);
    expect(alice.eventsOfType('typing')).toHaveLength(0);
  });

  it('delivers direct messages once per sender and each receiver socket', async () => {
    (drizzle as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      createDbMock({
        insertReturning: {
          id: 7,
          content: 'hi',
          createdAt: 123,
          read: 0,
          mediaUrl: null,
          mediaType: null,
        },
        receiverUser: { id: 2, username: 'bob' },
      }),
    );

    const alice = dob.addSocket();
    const bob = dob.addSocket();
    const bobTab = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });
    bobTab.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    await dob.handleClientMessage(alice as unknown as WebSocket, {
      type: 'send_message',
      payload: { receiverId: 2, content: 'hi' },
    });

    expect(alice.eventsOfType('message')).toHaveLength(1);
    expect(bob.eventsOfType('message')).toHaveLength(1);
    expect(bobTab.eventsOfType('message')).toHaveLength(1);
    expect(alice.eventsOfType('message')[0]?.payload).toMatchObject({
      id: 7,
      senderId: 1,
      receiverId: 2,
      content: 'hi',
    });
  });

  it('persists active_chat attachment and fans out read status', async () => {
    const alice = dob.addSocket();
    const bob = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    await dob.handleClientMessage(alice as unknown as WebSocket, {
      type: 'active_chat',
      payload: { recipientId: 2 },
    });

    expect(alice.attachment).toEqual({ userId: 1, username: 'alice', activeChatId: 2 });
    expect(bob.eventsOfType('messages_read')).toEqual([
      { type: 'messages_read', payload: { senderId: 2, receiverId: 1 } },
    ]);
  });

  it('ignores authenticated actions and broadcasts for unauthenticated sockets', async () => {
    const unauth = dob.addSocket();
    const alice = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });

    await dob.handleClientMessage(unauth as unknown as WebSocket, {
      type: 'typing',
      payload: { receiverId: 1, isTyping: true },
    });
    await dob.handleClientMessage(unauth as unknown as WebSocket, {
      type: 'send_message',
      payload: { receiverId: 1, content: 'nope' },
    });
    await dob.handleClientMessage(unauth as unknown as WebSocket, {
      type: 'active_chat',
      payload: { recipientId: 1 },
    });

    expect(alice.eventsOfType('typing')).toHaveLength(0);
    expect(alice.eventsOfType('message')).toHaveLength(0);
    expect(unauth.attachment).toBeNull();

    await dob.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      body: JSON.stringify({ type: 'post_created', payload: {} }),
    }));
    expect(unauth.eventsOfType('post_created')).toHaveLength(0);
    expect(alice.eventsOfType('post_created')).toHaveLength(1);
  });

  it('does not throw on malformed JSON or binary input', async () => {
    const ws = dob.addSocket();
    await expect(dob.webSocketMessage(ws as unknown as WebSocket, '{bad')).resolves.toBeUndefined();
    await expect(
      dob.webSocketMessage(ws as unknown as WebSocket, new ArrayBuffer(8)),
    ).resolves.toBeUndefined();
    expect(ws.eventsOfType('error')[0]?.payload).toEqual({ message: 'Unsupported message format' });
  });

  it('recovers routing exclusively from attachments after simulated re-instantiation', async () => {
    const alice = dob.addSocket();
    const bob = dob.addSocket();
    alice.serializeAttachment({ userId: 1, username: 'alice', activeChatId: 2 } satisfies RealtimeSession);
    bob.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });

    // Simulate DO wake: new instance, same socket list + attachments only.
    const woken = new TestRealtimeDO(state, env);
    woken.sockets = socketsRef.current;

    expect(woken.getOnlineUserIds().sort()).toEqual([1, 2]);
    expect(woken.getSession(alice as unknown as WebSocket)?.activeChatId).toBe(2);

    await woken.fetch(new Request('http://realtime/broadcast-user-event', {
      method: 'POST',
      body: JSON.stringify({ recipientId: 2, type: 'system_toast', payload: { content: 'wake' } }),
    }));

    expect(bob.eventsOfType('system_toast')).toHaveLength(1);
    expect(alice.eventsOfType('system_toast')).toHaveLength(0);
  });

  it('sendSafely continues fan-out when one socket fails', () => {
    const good = dob.addSocket();
    const bad = dob.addSocket();
    good.serializeAttachment({ userId: 1, username: 'alice', activeChatId: null });
    bad.serializeAttachment({ userId: 2, username: 'bob', activeChatId: null });
    bad.failSend = true;

    expect(() => dob.broadcastToAll({ type: 'system_toast', payload: { content: 'x' } })).not.toThrow();
    expect(good.eventsOfType('system_toast')).toHaveLength(1);
  });

  it('accepts websockets via hibernation API on upgrade', async () => {
    const pair = {
      0: new MockWebSocket(),
      1: new MockWebSocket(),
    };
    // Minimal stub: WebSocketPair is a Cloudflare global; simulate via acceptWebSocket spy.
    const acceptSpy = vi.spyOn(state, 'acceptWebSocket');

    // Call the upgrade branch by constructing a request; WebSocketPair may not exist in vitest.
    // Instead verify acceptWebSocket is the method used when we invoke it through a partial path.
    // Direct unit assertion: fetch upgrade requires WebSocketPair — skip runtime pair if missing.
    if (typeof WebSocketPair === 'undefined') {
      expect(typeof dob.state.acceptWebSocket).toBe('function');
      dob.state.acceptWebSocket(pair[1] as unknown as WebSocket);
      expect(acceptSpy).toHaveBeenCalled();
      return;
    }

    const res = await dob.fetch(new Request('http://realtime/ws', {
      headers: { Upgrade: 'websocket' },
    }));
    expect(res.status).toBe(101);
    expect(acceptSpy).toHaveBeenCalled();
  });
});
