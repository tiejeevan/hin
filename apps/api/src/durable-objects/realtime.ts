import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Message, Notification } from '@hin/types';
import { verify } from 'hono/jwt';
import type { Env } from '../types';
import { JWT_SECRET } from '../lib/auth';

export class RealtimeDO implements DurableObject {
  state: DurableObjectState;
  env: Env;
  sessions = new Map<WebSocket, { userId: number; username: string; activeChatId?: number | null }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  getOnlineUserIds(): number[] {
    const ids = new Set<number>();
    for (const session of this.sessions.values()) {
      ids.add(session.userId);
    }
    return Array.from(ids);
  }

  isUserOnline(userId: number): boolean {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) return true;
    }
    return false;
  }

  broadcastPresence(message: object, excludeWs?: WebSocket) {
    const msg = JSON.stringify(message);
    for (const [ws] of this.sessions.entries()) {
      if (excludeWs && ws === excludeWs) continue;
      try {
        ws.send(msg);
      } catch (e) {}
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast-notification') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { recipientId, notification } = await request.json() as { recipientId: number; notification: Notification };
      
      for (const [ws, session] of this.sessions.entries()) {
        if (session.userId === recipientId) {
          try {
            ws.send(JSON.stringify({ type: 'notification', payload: notification }));
          } catch (e) {}
        }
      }
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-notifications-batch') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { notifications } = await request.json() as { notifications: Notification[] };
      const byUserId = new Map<number, Notification>();
      for (const notification of notifications) {
        byUserId.set(notification.userId, notification);
      }

      for (const [ws, session] of this.sessions.entries()) {
        const notification = byUserId.get(session.userId);
        if (!notification) continue;
        try {
          ws.send(JSON.stringify({ type: 'notification', payload: notification }));
        } catch (e) {}
      }
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-system-toast') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { content } = await request.json() as { content: string };
      const msg = JSON.stringify({ type: 'system_toast', payload: { content } });
      for (const ws of this.sessions.keys()) {
        try {
          ws.send(msg);
        } catch (e) {}
      }
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-read-status') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { senderId, receiverId } = await request.json() as { senderId: number; receiverId: number };
      
      for (const [ws, session] of this.sessions.entries()) {
        if (session.userId === senderId) {
          try {
            ws.send(JSON.stringify({ type: 'messages_read', payload: { senderId, receiverId } }));
          } catch (e) {}
        }
      }
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-event') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const payload = await request.json();
      const msg = JSON.stringify(payload);
      for (const ws of this.sessions.keys()) {
        try {
          ws.send(msg);
        } catch (e) {}
      }
      return new Response('OK');
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleClientMessage(server, data);
      } catch (e) {
        console.error('Error handling websocket message:', e);
      }
    });

    server.addEventListener('close', () => {
      this.handleClose(server);
    });

    server.addEventListener('error', () => {
      this.handleClose(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleClientMessage(ws: WebSocket, message: any) {
    const db = drizzle(this.env.DB, { schema });

    if (message.type === 'join') {
      const { token } = message.payload;
      try {
        const payload = await verify(token, JWT_SECRET, 'HS256');
        const userId = payload.id as number;
        const username = payload.username as string;

        const wasOnline = this.isUserOnline(userId);
        this.sessions.set(ws, { userId, username });
        try {
          ws.send(JSON.stringify({ type: 'joined', payload: { userId } }));
          ws.send(JSON.stringify({
            type: 'presence_snapshot',
            payload: { onlineUserIds: this.getOnlineUserIds() },
          }));
        } catch (e) {}

        if (!wasOnline) {
          this.broadcastPresence({ type: 'user_online', payload: { userId } }, ws);
        }
      } catch (e) {
        console.error('WebSocket token authentication failed:', e);
        try {
          ws.send(JSON.stringify({ type: 'error', payload: { message: 'Authentication failed' } }));
        } catch (_) {}
      }
    } 
    
    else if (message.type === 'active_chat') {
      const session = this.sessions.get(ws);
      if (session) {
        const recipientId = message.payload.recipientId;
        session.activeChatId = recipientId;

        if (recipientId) {
          // Mark all messages from recipientId to user as read in the DB
          await db.update(schema.messages)
            .set({ read: 1 })
            .where(
              and(
                eq(schema.messages.senderId, recipientId),
                eq(schema.messages.receiverId, session.userId),
                eq(schema.messages.read, 0)
              )
            )
            .run();

          // Broadcast to sender (recipientId) that their messages were read
          for (const [targetWs, targetSession] of this.sessions.entries()) {
            if (targetSession.userId === recipientId) {
              try {
                targetWs.send(JSON.stringify({ 
                  type: 'messages_read', 
                  payload: { senderId: recipientId, receiverId: session.userId } 
                }));
              } catch (e) {}
            }
          }
        }
      }
    }
    
    else if (message.type === 'send_message') {
      const session = this.sessions.get(ws);
      if (!session) return;

      const { receiverId, content } = message.payload;
      
      // Determine if receiver has active chat open with sender
      let receiverIsViewingChat = false;
      for (const [_, targetSession] of this.sessions.entries()) {
        if (targetSession.userId === receiverId && targetSession.activeChatId === session.userId) {
          receiverIsViewingChat = true;
          break;
        }
      }

      const [inserted] = await db.insert(schema.messages).values({
        senderId: session.userId,
        receiverId,
        content,
        read: receiverIsViewingChat ? 1 : 0,
      }).returning();

      const receiverUser = await db.select().from(schema.users).where(eq(schema.users.id, receiverId)).get();

      const messagePayload: Message = {
        id: inserted.id,
        senderId: session.userId,
        senderUsername: session.username,
        receiverId,
        receiverUsername: receiverUser?.username || 'Unknown',
        content,
        createdAt: inserted.createdAt,
        read: inserted.read === 1,
      };

      try {
        ws.send(JSON.stringify({ type: 'message', payload: messagePayload }));
      } catch (e) {}

      for (const [targetWs, targetSession] of this.sessions.entries()) {
        if (targetSession.userId === receiverId) {
          try {
            targetWs.send(JSON.stringify({ type: 'message', payload: messagePayload }));
          } catch (e) {}
        }
      }
    }

    else if (message.type === 'typing') {
      const session = this.sessions.get(ws);
      if (session) {
        const { receiverId, isTyping } = message.payload;
        // Forward typing event to the receiver
        for (const [targetWs, targetSession] of this.sessions.entries()) {
          if (targetSession.userId === receiverId) {
            try {
              targetWs.send(JSON.stringify({
                type: 'typing',
                payload: { senderId: session.userId, isTyping }
              }));
            } catch (e) {}
          }
        }
      }
    }
  }

  handleClose(ws: WebSocket) {
    const session = this.sessions.get(ws);
    if (!session) return;

    const userId = session.userId;
    this.sessions.delete(ws);

    if (!this.isUserOnline(userId)) {
      this.broadcastPresence({ type: 'user_offline', payload: { userId } });
    }
  }
}
