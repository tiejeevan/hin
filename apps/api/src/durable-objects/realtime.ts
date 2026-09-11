import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray, sql, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Message, Notification, type MessageReplyTo } from '@hin/types';
import { verify } from 'hono/jwt';
import type { Env } from '../types';
import { getJwtSecret } from '../lib/auth';
import { isBlocked } from '../lib/blocks';
import { parseFirstUrl, getOrFetchLinkPreview } from '../lib/linkPreview';
import { isPresenceEnabled, getSystemSettings } from '../lib/system-settings';
import { markMessagesReadSet, toMessageDto, loadReplyToMap } from '../lib/messages';
import { buildWsBucketKey, MemoryRateLimiter } from '../lib/rate-limit-memory';
import { WS_SEND_MESSAGE, WS_TYPING } from '../lib/rate-limit-policy';
import {
  getAccountBlockMessage,
  getAccountBlockReason,
  loadUserForAccountGuard,
} from '../lib/account-guard';

export interface RealtimeSession {
  userId: number;
  username: string;
  role: string;
  activeChatId: number | null;
  accountSetupComplete: boolean;
}

/** Application close code used when JWT join fails. */
export const AUTH_FAILURE_CLOSE_CODE = 4001;

/** Application close code when account setup (username/email) is incomplete. */
export const ACCOUNT_SETUP_BLOCKED_CLOSE_CODE = 4002;

export function parseSessionAttachment(raw: unknown): RealtimeSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.userId !== 'number' || !Number.isFinite(obj.userId)) return null;
  if (typeof obj.username !== 'string' || !obj.username) return null;

  const role = typeof obj.role === 'string' && obj.role ? obj.role : 'user';
  const accountSetupComplete = obj.accountSetupComplete === true;

  if (obj.activeChatId === null || obj.activeChatId === undefined) {
    return { userId: obj.userId, username: obj.username, role, activeChatId: null, accountSetupComplete };
  }
  if (typeof obj.activeChatId !== 'number' || !Number.isFinite(obj.activeChatId)) {
    return null;
  }
  return {
    userId: obj.userId,
    username: obj.username,
    role,
    activeChatId: obj.activeChatId,
    accountSetupComplete,
  };
}

export class RealtimeDO implements DurableObject {
  state: DurableObjectState;
  env: Env;
  private memoryRateLimiter = new MemoryRateLimiter();

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

  /** Session with completed account setup — required for mutating WS actions. */
  requireReadySession(ws: WebSocket): RealtimeSession | null {
    const session = this.getSession(ws);
    if (!session || !session.accountSetupComplete) return null;
    return session;
  }

  setSession(ws: WebSocket, session: RealtimeSession): void {
    ws.serializeAttachment({
      userId: session.userId,
      username: session.username,
      role: session.role,
      activeChatId: session.activeChatId,
      accountSetupComplete: session.accountSetupComplete,
    });
  }

  private shouldBypassWsRateLimit(session: RealtimeSession): boolean {
    return session.role === 'admin';
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

  private async attachLinkPreviewToMessage(opts: {
    messageId: number;
    firstUrl: string;
    senderId: number;
    senderUsername: string;
    receiverId: number;
  }): Promise<void> {
    const db = drizzle(this.env.DB, { schema });
    const linkPreviewId = await getOrFetchLinkPreview(db, opts.firstUrl, {
      olabidApiKey: this.env.OLABID_API_KEY,
    });
    if (linkPreviewId === null) return;

    const row = await db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.id, opts.messageId), isNull(schema.messages.deletedAt)))
      .get();
    if (!row) return;

    await db
      .update(schema.messages)
      .set({ linkPreviewId })
      .where(eq(schema.messages.id, opts.messageId))
      .run();

    const receiverUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, opts.receiverId))
      .get();
    const linkPreviewRow = await db
      .select()
      .from(schema.linkPreviews)
      .where(eq(schema.linkPreviews.id, linkPreviewId))
      .get();

    let replyTo: MessageReplyTo | null = null;
    if (row.replyToMessageId) {
      const replyMap = await loadReplyToMap(db, [row.replyToMessageId]);
      replyTo = replyMap.get(row.replyToMessageId) ?? null;
    }

    const messagePayload: Message = toMessageDto({
      id: row.id,
      senderId: opts.senderId,
      senderUsername: opts.senderUsername,
      receiverId: opts.receiverId,
      receiverUsername: receiverUser?.username || 'Unknown',
      content: row.content,
      createdAt: row.createdAt,
      read: row.read,
      deliveredAt: row.deliveredAt,
      readAt: row.readAt,
      linkPreview: linkPreviewRow
        ? {
            url: linkPreviewRow.url,
            title: linkPreviewRow.title,
            description: linkPreviewRow.description,
            imageUrl: linkPreviewRow.imageUrl,
            siteName: linkPreviewRow.siteName,
          }
        : null,
      mediaUrl: row.mediaUrl,
      mediaType: row.mediaType,
      clientMessageId: row.clientMessageId,
      replyToMessageId: row.replyToMessageId,
      replyTo,
    });

    const event = { type: 'message_updated' as const, payload: messagePayload };
    this.broadcastToUser(opts.senderId, event);
    this.broadcastToUser(opts.receiverId, event);
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
      const { senderId, receiverId, readAt } = await request.json() as {
        senderId: number;
        receiverId: number;
        readAt?: string;
      };
      this.broadcastToUser(senderId, {
        type: 'messages_read',
        payload: {
          senderId,
          receiverId,
          readAt: readAt || new Date().toISOString(),
        },
      });
      return new Response('OK');
    }

    if (url.pathname === '/broadcast-message-delivered') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { recipientId, messageIds, deliveredAt } = await request.json() as {
        recipientId: number;
        messageIds: number[];
        deliveredAt: string;
      };
      if (recipientId && Array.isArray(messageIds) && messageIds.length > 0) {
        this.broadcastToUser(recipientId, {
          type: 'message_delivered',
          payload: { messageIds, deliveredAt },
        });
      }
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
    // 1000/1001 = normal; 1005 = no status; 4001 = auth failure close we initiated.
    if (code !== 1000 && code !== 1001 && code !== 1005 && code !== AUTH_FAILURE_CLOSE_CODE) {
      console.error('WebSocket closed abnormally:', code);
    }
    void this.handleClose(ws);
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('WebSocket error:', error);
    void this.handleClose(ws);
  }

  async handleClientMessage(ws: WebSocket, message: any) {
    const db = drizzle(this.env.DB, { schema });

    if (message.type === 'join') {
      const { token } = message.payload ?? {};
      try {
        const payload = await verify(token, getJwtSecret(this.env), 'HS256');
        const userId = payload.id as number;
        const username = payload.username as string;
        const role = typeof payload.role === 'string' && payload.role ? payload.role : 'user';

        const [guardUser, systemSettings] = await Promise.all([
          loadUserForAccountGuard(db, userId),
          getSystemSettings(db),
        ]);
        if (!guardUser) {
          throw new Error('User not found');
        }
        const blockReason = getAccountBlockReason(guardUser, {
          emailVerificationRequired: systemSettings.emailVerificationRequired,
        });
        if (blockReason) {
          const blockMessage = getAccountBlockMessage(blockReason);
          this.sendSafely(ws, { type: 'error', payload: { message: blockMessage, code: blockReason } });
          try {
            ws.close(ACCOUNT_SETUP_BLOCKED_CLOSE_CODE, blockMessage);
          } catch (_) {}
          return;
        }

        const presenceOn = await isPresenceEnabled(db);
        const wasOnline = presenceOn ? this.isUserOnline(userId) : true;
        this.setSession(ws, {
          userId,
          username,
          role,
          activeChatId: null,
          accountSetupComplete: true,
        });

        this.sendSafely(ws, { type: 'joined', payload: { userId } });

        // Presence is fully gated: no snapshot / online events when disabled.
        if (presenceOn) {
          this.sendSafely(ws, {
            type: 'presence_snapshot',
            payload: { onlineUserIds: this.getOnlineUserIds() },
          });

          if (!wasOnline) {
            this.broadcastToAll({ type: 'user_online', payload: { userId } }, ws);
          }
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
      const session = this.requireReadySession(ws);
      if (!session) return;

      const recipientId = message.payload?.recipientId;
      const activeChatId = typeof recipientId === 'number' ? recipientId : null;
      // Always re-serialize the full session; never mutate a deserialized attachment in place.
      this.setSession(ws, { ...session, activeChatId });

      if (activeChatId) {
        const readAt = new Date().toISOString();
        await db.update(schema.messages)
          .set(markMessagesReadSet(readAt))
          .where(
            and(
              eq(schema.messages.senderId, activeChatId),
              eq(schema.messages.receiverId, session.userId),
              eq(schema.messages.read, 0),
              sql`${schema.messages.deletedAt} IS NULL`,
            )
          )
          .run();

        this.broadcastToUser(activeChatId, {
          type: 'messages_read',
          payload: { senderId: activeChatId, receiverId: session.userId, readAt },
        });
      }
    }

    else if (message.type === 'send_message') {
      const session = this.requireReadySession(ws);
      if (!session) return;

      const {
        receiverId,
        content: rawContent,
        suppressLinkPreview,
        mediaUrl: rawMediaUrl,
        mediaType: rawMediaType,
        clientMessageId: rawClientMessageId,
        replyToMessageId: rawReplyToMessageId,
      } = message.payload as {
        receiverId: number;
        content?: string;
        suppressLinkPreview?: boolean;
        mediaUrl?: string;
        mediaType?: string;
        clientMessageId?: string;
        replyToMessageId?: number;
      };

      const content = typeof rawContent === 'string' ? rawContent.trim() : '';
      const mediaUrl = typeof rawMediaUrl === 'string' && rawMediaUrl.trim() ? rawMediaUrl.trim() : null;
      const allowedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      const mediaType =
        typeof rawMediaType === 'string' && allowedMediaTypes.has(rawMediaType) ? rawMediaType : null;
      const clientMessageId =
        typeof rawClientMessageId === 'string' && rawClientMessageId.trim()
          ? rawClientMessageId.trim().slice(0, 64)
          : null;
      const replyToMessageId =
        typeof rawReplyToMessageId === 'number' && Number.isFinite(rawReplyToMessageId) && rawReplyToMessageId > 0
          ? rawReplyToMessageId
          : null;

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

      // Idempotent retry: return existing row for the same clientMessageId.
      if (clientMessageId) {
        const existing = await db
          .select()
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.senderId, session.userId),
              eq(schema.messages.clientMessageId, clientMessageId),
              sql`${schema.messages.deletedAt} IS NULL`,
            ),
          )
          .get();

        if (existing) {
          const receiverUser = await db.select().from(schema.users).where(eq(schema.users.id, existing.receiverId)).get();
          const linkPreviewRow = existing.linkPreviewId
            ? await db.select().from(schema.linkPreviews).where(eq(schema.linkPreviews.id, existing.linkPreviewId)).get()
            : null;
          let existingReplyTo: MessageReplyTo | null = null;
          if (existing.replyToMessageId) {
            const replyMap = await loadReplyToMap(db, [existing.replyToMessageId]);
            existingReplyTo = replyMap.get(existing.replyToMessageId) ?? null;
          }
          const messagePayload: Message = toMessageDto({
            id: existing.id,
            senderId: session.userId,
            senderUsername: session.username,
            receiverId: existing.receiverId,
            receiverUsername: receiverUser?.username || 'Unknown',
            content: existing.content,
            createdAt: existing.createdAt,
            read: existing.read,
            deliveredAt: existing.deliveredAt,
            readAt: existing.readAt,
            linkPreview: linkPreviewRow
              ? {
                  url: linkPreviewRow.url,
                  title: linkPreviewRow.title,
                  description: linkPreviewRow.description,
                  imageUrl: linkPreviewRow.imageUrl,
                  siteName: linkPreviewRow.siteName,
                }
              : null,
            mediaUrl: existing.mediaUrl,
            mediaType: existing.mediaType,
            clientMessageId: existing.clientMessageId ?? clientMessageId,
            replyToMessageId: existing.replyToMessageId ?? null,
            replyTo: existingReplyTo,
          });
          this.sendSafely(ws, { type: 'message', payload: messagePayload });
          return;
        }
      }

      if (!this.shouldBypassWsRateLimit(session)) {
        const sendLimit = this.memoryRateLimiter.consume(
          buildWsBucketKey('send', session.userId),
          WS_SEND_MESSAGE.limit,
          WS_SEND_MESSAGE.windowSec,
        );
        if (!sendLimit.ok) {
          this.sendSafely(ws, {
            type: 'error',
            payload: { message: 'Too many messages. Slow down.', code: 'rate_limit' },
          });
          return;
        }
      }

      let replyTo: MessageReplyTo | null = null;
      if (replyToMessageId) {
        const parent = await db
          .select({
            id: schema.messages.id,
            senderId: schema.messages.senderId,
            receiverId: schema.messages.receiverId,
            deletedAt: schema.messages.deletedAt,
          })
          .from(schema.messages)
          .where(eq(schema.messages.id, replyToMessageId))
          .get();

        const sameConversation = !!parent && (
          (parent.senderId === session.userId && parent.receiverId === receiverId) ||
          (parent.senderId === receiverId && parent.receiverId === session.userId)
        );
        if (!parent || parent.deletedAt || !sameConversation) {
          this.sendSafely(ws, { type: 'error', payload: { message: 'Invalid reply target' } });
          return;
        }

        const replyMap = await loadReplyToMap(db, [replyToMessageId]);
        replyTo = replyMap.get(replyToMessageId) ?? null;
        if (!replyTo) {
          this.sendSafely(ws, { type: 'error', payload: { message: 'Invalid reply target' } });
          return;
        }
      }

      let receiverIsViewingChat = false;
      for (const targetWs of this.getAuthenticatedSockets()) {
        const targetSession = this.getSession(targetWs);
        if (targetSession?.userId === receiverId && targetSession.activeChatId === session.userId) {
          receiverIsViewingChat = true;
          break;
        }
      }

      const receiverOnline = this.isUserOnline(receiverId);
      const nowIso = new Date().toISOString();
      let deliveredAt: string | null = null;
      let readAt: string | null = null;
      let readFlag = 0;
      if (receiverIsViewingChat) {
        readFlag = 1;
        deliveredAt = nowIso;
        readAt = nowIso;
      } else if (receiverOnline) {
        deliveredAt = nowIso;
      }

      const firstUrl = !suppressLinkPreview && content ? parseFirstUrl(content) : null;

      const [inserted] = await db.insert(schema.messages).values({
        senderId: session.userId,
        receiverId,
        content: content || '',
        read: readFlag,
        deliveredAt,
        readAt,
        linkPreviewId: null,
        mediaUrl,
        mediaType: resolvedMediaType,
        clientMessageId,
        replyToMessageId,
      }).returning();

      const receiverUser = await db.select().from(schema.users).where(eq(schema.users.id, receiverId)).get();

      const messagePayload: Message = toMessageDto({
        id: inserted.id,
        senderId: session.userId,
        senderUsername: session.username,
        receiverId,
        receiverUsername: receiverUser?.username || 'Unknown',
        content: inserted.content,
        createdAt: inserted.createdAt,
        read: inserted.read,
        deliveredAt: inserted.deliveredAt ?? deliveredAt,
        readAt: inserted.readAt ?? readAt,
        linkPreview: null,
        mediaUrl: inserted.mediaUrl,
        mediaType: inserted.mediaType,
        clientMessageId: inserted.clientMessageId ?? clientMessageId,
        replyToMessageId: inserted.replyToMessageId ?? replyToMessageId,
        replyTo,
      });

      this.sendSafely(ws, { type: 'message', payload: messagePayload });
      this.broadcastToUser(receiverId, { type: 'message', payload: messagePayload });

      if (firstUrl) {
        this.state.waitUntil(
          this.attachLinkPreviewToMessage({
            messageId: inserted.id,
            firstUrl,
            senderId: session.userId,
            senderUsername: session.username,
            receiverId,
          }),
        );
      }
    }

    else if (message.type === 'delete_message') {
      const session = this.requireReadySession(ws);
      if (!session) return;

      const rawMessageId = message.payload?.messageId;
      const messageId =
        typeof rawMessageId === 'number' && Number.isFinite(rawMessageId) && rawMessageId > 0
          ? rawMessageId
          : null;
      if (!messageId) {
        this.sendSafely(ws, { type: 'error', payload: { message: 'Invalid message id' } });
        return;
      }

      const existing = await db
        .select({
          id: schema.messages.id,
          senderId: schema.messages.senderId,
          receiverId: schema.messages.receiverId,
          deletedAt: schema.messages.deletedAt,
        })
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .get();

      if (!existing || existing.senderId !== session.userId) {
        this.sendSafely(ws, { type: 'error', payload: { message: 'Cannot delete this message' } });
        return;
      }

      if (!existing.deletedAt) {
        await db.update(schema.messages)
          .set({ deletedAt: new Date().toISOString() })
          .where(eq(schema.messages.id, messageId))
          .run();
      }

      // conversationPeerId is the other party from each recipient's perspective.
      this.broadcastToUser(existing.senderId, {
        type: 'message_deleted',
        payload: { messageId, conversationPeerId: existing.receiverId },
      });
      this.broadcastToUser(existing.receiverId, {
        type: 'message_deleted',
        payload: { messageId, conversationPeerId: existing.senderId },
      });
    }

    else if (message.type === 'ack_delivered') {
      const session = this.requireReadySession(ws);
      if (!session) return;

      const rawIds = message.payload?.messageIds;
      if (!Array.isArray(rawIds) || rawIds.length === 0) return;
      const messageIds = [...new Set(
        rawIds.filter((id: unknown): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0),
      )].slice(0, 200);
      if (messageIds.length === 0) return;

      const deliveredAt = new Date().toISOString();
      const undelivered = await db
        .select({
          id: schema.messages.id,
          senderId: schema.messages.senderId,
        })
        .from(schema.messages)
        .where(
          and(
            inArray(schema.messages.id, messageIds),
            eq(schema.messages.receiverId, session.userId),
            isNull(schema.messages.deliveredAt),
            sql`${schema.messages.deletedAt} IS NULL`,
          ),
        )
        .all();

      if (undelivered.length === 0) return;

      const ids = undelivered.map(m => m.id);
      await db.update(schema.messages)
        .set({ deliveredAt })
        .where(inArray(schema.messages.id, ids))
        .run();

      const bySender = new Map<number, number[]>();
      for (const row of undelivered) {
        const list = bySender.get(row.senderId) ?? [];
        list.push(row.id);
        bySender.set(row.senderId, list);
      }
      for (const [senderId, idsForSender] of bySender) {
        this.broadcastToUser(senderId, {
          type: 'message_delivered',
          payload: { messageIds: idsForSender, deliveredAt },
        });
      }
    }

    else if (message.type === 'typing') {
      const session = this.requireReadySession(ws);
      if (!session) return;

      if (!this.shouldBypassWsRateLimit(session)) {
        const typingLimit = this.memoryRateLimiter.consume(
          buildWsBucketKey('typing', session.userId),
          WS_TYPING.limit,
          WS_TYPING.windowSec,
        );
        if (!typingLimit.ok) return;
      }

      const { receiverId, isTyping } = message.payload;
      this.broadcastToUser(receiverId, {
        type: 'typing',
        payload: { senderId: session.userId, isTyping },
      });
    }
  }

  async handleClose(ws: WebSocket): Promise<void> {
    const session = this.getSession(ws);
    if (!session) return;

    const userId = session.userId;
    // Closing socket may still appear in getWebSockets(); exclude it explicitly.
    if (!this.isUserOnline(userId, ws)) {
      const db = drizzle(this.env.DB, { schema });
      if (await isPresenceEnabled(db)) {
        const lastSeenAt = new Date().toISOString();
        try {
          await db.update(schema.users)
            .set({ lastSeenAt })
            .where(eq(schema.users.id, userId))
            .run();
        } catch (e) {
          console.error('Failed to persist lastSeenAt:', e);
        }
        this.broadcastToAll({ type: 'user_offline', payload: { userId, lastSeenAt } }, ws);
      }
    }
  }
}
