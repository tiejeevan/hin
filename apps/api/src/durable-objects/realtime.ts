import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Message, Notification } from '@hin/types';
import { verify } from 'hono/jwt';
import type { Env } from '../types';
import { JWT_SECRET } from '../lib/auth';
import { isBlocked } from '../lib/blocks';
import { parseFirstUrl, getOrFetchLinkPreview } from '../lib/linkPreview';

export interface RealtimeSession {
  userId: number;
  username: string;
  activeChatId: number | null;
}

/** Application close code used when JWT join fails. */
export const AUTH_FAILURE_CLOSE_CODE = 4001;

export function parseSessionAttachment(raw: unknown): RealtimeSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.userId !== 'number' || !Number.isFinite(obj.userId)) return null;
  if (typeof obj.username !== 'string' || !obj.username) return null;

  if (obj.activeChatId === null || obj.activeChatId === undefined) {
    return { userId: obj.userId, username: obj.username, activeChatId: null };
  }
  if (typeof obj.activeChatId !== 'number' || !Number.isFinite(obj.activeChatId)) {
    return null;
  }
  return {
    userId: obj.userId,
    username: obj.username,
    activeChatId: obj.activeChatId,
  };
}

export class RealtimeDO implements DurableObject {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  /** Overridable for unit tests that inject mock sockets. */
  getConnectedWebSockets(): WebSocket[] {
    return this.state.getWebSockets();
  }

  getSession(ws: WebSocket): RealtimeSession | null {
    try {
      return parseSessionAttachment(ws.deserializeAttachment());
    } catch (e) {
      console.error('Invalid websocket attachment:', e);
      return null;
    }
  }

  setSession(ws: WebSocket, session: RealtimeSession): void {
    ws.serializeAttachment({
      userId: session.userId,
      username: session.username,
      activeChatId: session.activeChatId,
    });
  }

  clearSession(ws: WebSocket): void {
    try {
      ws.serializeAttachment(null);
    } catch (e) {
      console.error('Failed to clear websocket attachment:', e);
    }
  }

  getAuthenticatedSockets(excludingSocket?: WebSocket): WebSocket[] {
    const result: WebSocket[] = [];
    for (const ws of this.getConnectedWebSockets()) {
      if (excludingSocket && ws === excludingSocket) continue;
      if (this.getSession(ws)) result.push(ws);
    }
    return result;
  }

  getOnlineUserIds(excludingSocket?: WebSocket): number[] {
    const ids = new Set<number>();
    for (const ws of this.getAuthenticatedSockets(excludingSocket)) {
      const session = this.getSession(ws);
      if (session) ids.add(session.userId);
    }
    return Array.from(ids);
  }

  isUserOnline(userId: number, excludingSocket?: WebSocket): boolean {
    for (const ws of this.getAuthenticatedSockets(excludingSocket)) {
      const session = this.getSession(ws);
      if (session?.userId === userId) return true;
    }
    return false;
  }

  sendSafely(ws: WebSocket, event: object): void {
    try {
      ws.send(JSON.stringify(event));
    } catch (e) {
      console.error('Failed to send websocket message:', e);
    }
  }

  broadcastToAll(event: object, excludingSocket?: WebSocket): void {
    for (const ws of this.getAuthenticatedSockets(excludingSocket)) {
      this.sendSafely(ws, event);
    }
  }

  broadcastToUser(userId: number, event: object, excludingSocket?: WebSocket): void {
    for (const ws of this.getAuthenticatedSockets(excludingSocket)) {
      const session = this.getSession(ws);
      if (session?.userId === userId) {
        this.sendSafely(ws, event);
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast-notification') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { recipientId, notification } = await request.json() as {
        recipientId: number;
        notification: Notification;
      };
      this.broadcastToUser(recipientId, { type: 'notification', payload: notification });
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

      for (const ws of this.getAuthenticatedSockets()) {
        const session = this.getSession(ws);
        if (!session) continue;
        const notification = byUserId.get(session.userId);
        if (!notification) continue;
        this.sendSafely(ws, { type: 'notification', payload: notification });
      }
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-system-toast') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { content } = await request.json() as { content: string };
      this.broadcastToAll({ type: 'system_toast', payload: { content } });
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-read-status') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { senderId, receiverId } = await request.json() as {
        senderId: number;
        receiverId: number;
      };
      this.broadcastToUser(senderId, {
        type: 'messages_read',
        payload: { senderId, receiverId },
      });
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-event') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const payload = await request.json();
      this.broadcastToAll(payload as object);
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-user-event') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { recipientId, ...event } = await request.json() as {
        recipientId: number;
      } & Record<string, unknown>;
      this.broadcastToUser(recipientId, event);
      return new Response('OK');
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      console.error('Unsupported binary websocket message');
      this.sendSafely(ws, { type: 'error', payload: { message: 'Unsupported message format' } });
      return;
    }

    try {
      const data = JSON.parse(message);
      await this.handleClientMessage(ws, data);
    } catch (e) {
      console.error('Error handling websocket message:', e);
    }
  }

  webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): void {
    // 1000/1001 = normal; 1005 = no status (common when client drops without close frame).
    if (code !== 1000 && code !== 1001 && code !== 1005) {
      console.error('WebSocket closed abnormally:', code);
    }
    this.handleClose(ws);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('WebSocket error:', error);
    this.handleClose(ws);
  }

  async handleClientMessage(ws: WebSocket, message: any) {
    const db = drizzle(this.env.DB, { schema });

    if (message.type === 'join') {
      const { token } = message.payload ?? {};
      try {
        const payload = await verify(token, JWT_SECRET, 'HS256');
        const userId = payload.id as number;
        const username = payload.username as string;

        const wasOnline = this.isUserOnline(userId);
        this.setSession(ws, { userId, username, activeChatId: null });

        this.sendSafely(ws, { type: 'joined', payload: { userId } });
        this.sendSafely(ws, {
          type: 'presence_snapshot',
          payload: { onlineUserIds: this.getOnlineUserIds() },
        });

        if (!wasOnline) {
          this.broadcastToAll({ type: 'user_online', payload: { userId } }, ws);
        }
      } catch (e) {
        console.error('WebSocket token authentication failed:', e);
        this.sendSafely(ws, { type: 'error', payload: { message: 'Authentication failed' } });
        try {
          ws.close(AUTH_FAILURE_CLOSE_CODE, 'Authentication failed');
        } catch (_) {}
      }
    }

    else if (message.type === 'active_chat') {
      const session = this.getSession(ws);
      if (!session) return;

      const recipientId = message.payload?.recipientId;
      const activeChatId = typeof recipientId === 'number' ? recipientId : null;
      // Always re-serialize the full session; never mutate a deserialized attachment in place.
      this.setSession(ws, { ...session, activeChatId });

      if (activeChatId) {
        await db.update(schema.messages)
          .set({ read: 1 })
          .where(
            and(
              eq(schema.messages.senderId, activeChatId),
              eq(schema.messages.receiverId, session.userId),
              eq(schema.messages.read, 0)
            )
          )
          .run();

        this.broadcastToUser(activeChatId, {
          type: 'messages_read',
          payload: { senderId: activeChatId, receiverId: session.userId },
        });
      }
    }

    else if (message.type === 'send_message') {
      const session = this.getSession(ws);
      if (!session) return;

      const {
        receiverId,
        content: rawContent,
        suppressLinkPreview,
        mediaUrl: rawMediaUrl,
        mediaType: rawMediaType,
      } = message.payload as {
        receiverId: number;
        content?: string;
        suppressLinkPreview?: boolean;
        mediaUrl?: string;
        mediaType?: string;
      };

      const content = typeof rawContent === 'string' ? rawContent.trim() : '';
      const mediaUrl = typeof rawMediaUrl === 'string' && rawMediaUrl.trim() ? rawMediaUrl.trim() : null;
      const allowedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const mediaType =
        typeof rawMediaType === 'string' && allowedMediaTypes.has(rawMediaType) ? rawMediaType : null;

      if (!content && !mediaUrl) {
        this.sendSafely(ws, { type: 'error', payload: { message: 'Message cannot be empty' } });
        return;
      }
      if (content.length > 1000) {
        this.sendSafely(ws, { type: 'error', payload: { message: 'Message is too long' } });
        return;
      }

      let resolvedMediaType: string | null = null;
      if (mediaUrl) {
        const owned = await db
          .select({ id: schema.mediaUploads.id, mimeType: schema.mediaUploads.mimeType })
          .from(schema.mediaUploads)
          .where(
            and(
              eq(schema.mediaUploads.url, mediaUrl),
              eq(schema.mediaUploads.userId, session.userId),
              eq(schema.mediaUploads.type, 'chat'),
            ),
          )
          .get();
        if (!owned) {
          this.sendSafely(ws, { type: 'error', payload: { message: 'Invalid image attachment' } });
          return;
        }
        resolvedMediaType = mediaType || owned.mimeType || 'image/jpeg';
      }

      if (await isBlocked(db, session.userId, receiverId)) {
        this.sendSafely(ws, { type: 'error', payload: { message: 'Cannot message this user' } });
        return;
      }

      let receiverIsViewingChat = false;
      for (const targetWs of this.getAuthenticatedSockets()) {
        const targetSession = this.getSession(targetWs);
        if (targetSession?.userId === receiverId && targetSession.activeChatId === session.userId) {
          receiverIsViewingChat = true;
          break;
        }
      }

      const firstUrl = !suppressLinkPreview && content ? parseFirstUrl(content) : null;
      const linkPreviewId = firstUrl
        ? await getOrFetchLinkPreview(db, firstUrl, { olabidApiKey: this.env.OLABID_API_KEY })
        : null;

      const [inserted] = await db.insert(schema.messages).values({
        senderId: session.userId,
        receiverId,
        content: content || '',
        read: receiverIsViewingChat ? 1 : 0,
        linkPreviewId,
        mediaUrl,
        mediaType: resolvedMediaType,
      }).returning();

      const receiverUser = await db.select().from(schema.users).where(eq(schema.users.id, receiverId)).get();
      const linkPreviewRow = linkPreviewId
        ? await db.select().from(schema.linkPreviews).where(eq(schema.linkPreviews.id, linkPreviewId)).get()
        : null;

      const messagePayload: Message = {
        id: inserted.id,
        senderId: session.userId,
        senderUsername: session.username,
        receiverId,
        receiverUsername: receiverUser?.username || 'Unknown',
        content: inserted.content,
        createdAt: inserted.createdAt,
        read: inserted.read === 1,
        linkPreview: linkPreviewRow
          ? {
              url: linkPreviewRow.url,
              title: linkPreviewRow.title,
              description: linkPreviewRow.description,
              imageUrl: linkPreviewRow.imageUrl,
              siteName: linkPreviewRow.siteName,
            }
          : null,
        mediaUrl: inserted.mediaUrl,
        mediaType: inserted.mediaType,
      };

      this.sendSafely(ws, { type: 'message', payload: messagePayload });
      this.broadcastToUser(receiverId, { type: 'message', payload: messagePayload });
    }

    else if (message.type === 'typing') {
      const session = this.getSession(ws);
      if (!session) return;

      const { receiverId, isTyping } = message.payload;
      this.broadcastToUser(receiverId, {
        type: 'typing',
        payload: { senderId: session.userId, isTyping },
      });
    }
  }

  handleClose(ws: WebSocket): void {
    const session = this.getSession(ws);
    if (!session) return;

    const userId = session.userId;
    // Closing socket may still appear in getWebSockets(); exclude it explicitly.
    if (!this.isUserOnline(userId, ws)) {
      this.broadcastToAll({ type: 'user_offline', payload: { userId } }, ws);
    }
  }
}
