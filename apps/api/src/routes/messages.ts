import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql, inArray, gt, isNull, or } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Message } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { isBlocked } from '../lib/blocks';
import { countUnreadMessages, listMessageThreads, markMessagesReadSet, toMessageDto } from '../lib/messages';

const messages = new Hono<{ Bindings: Env }>();

async function broadcastReadStatus(
  env: Env,
  senderId: number,
  receiverId: number,
  readAt: string,
): Promise<void> {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-read-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId, receiverId, readAt }),
    }));
  } catch (_e) {}
}

async function broadcastMessageDelivered(
  env: Env,
  recipientId: number,
  messageIds: number[],
  deliveredAt: string,
): Promise<void> {
  if (messageIds.length === 0) return;
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-message-delivered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, messageIds, deliveredAt }),
    }));
  } catch (_e) {}
}

// Unread message count for badge
messages.get('/unread-count', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const count = await countUnreadMessages(db, authUser.id);
  return c.json({ count });
});

// Get DM threads list (other users with last message preview and unread count)
messages.get('/threads', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const threads = await listMessageThreads(db, authUser.id);
  return c.json(threads);
});

// Mark messages from a specific user as read (before /:otherUserId)
messages.post('/read/:otherUserId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const otherUserId = parseInt(c.req.param('otherUserId'));
  const readAt = new Date().toISOString();

  await db.update(schema.messages)
    .set(markMessagesReadSet(readAt))
    .where(
      and(
        eq(schema.messages.senderId, otherUserId),
        eq(schema.messages.receiverId, authUser.id),
        eq(schema.messages.read, 0),
        sql`${schema.messages.deletedAt} IS NULL`,
      )
    )
    .run();

  await broadcastReadStatus(c.env, otherUserId, authUser.id, readAt);

  return c.json({ success: true });
});

// Get direct messages history (optional delta via sinceId; catch-up never marks read)
messages.get('/:otherUserId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const otherUserId = parseInt(c.req.param('otherUserId'));
  if (!Number.isFinite(otherUserId)) {
    return c.json({ error: 'Invalid user id' }, 400);
  }

  if (await isBlocked(db, authUser.id, otherUserId)) {
    return c.json({ error: 'Cannot message this user' }, 403);
  }

  const sinceIdRaw = c.req.query('sinceId');
  const sinceId = sinceIdRaw ? parseInt(sinceIdRaw, 10) : NaN;
  const hasSinceId = Number.isFinite(sinceId) && sinceId > 0;

  // Default markRead=true for full history open; sinceId catch-up always skips mark-read.
  const markReadParam = c.req.query('markRead');
  const markRead = hasSinceId
    ? false
    : markReadParam === '0' || markReadParam === 'false'
      ? false
      : true;

  if (markRead) {
    const readAt = new Date().toISOString();
    await db.update(schema.messages)
      .set(markMessagesReadSet(readAt))
      .where(
        and(
          eq(schema.messages.senderId, otherUserId),
          eq(schema.messages.receiverId, authUser.id),
          eq(schema.messages.read, 0),
          sql`${schema.messages.deletedAt} IS NULL`,
        )
      )
      .run();

    await broadcastReadStatus(c.env, otherUserId, authUser.id, readAt);
  }

  const pairFilter = or(
    and(eq(schema.messages.senderId, authUser.id), eq(schema.messages.receiverId, otherUserId)),
    and(eq(schema.messages.senderId, otherUserId), eq(schema.messages.receiverId, authUser.id)),
  );

  const conditions = [
    pairFilter,
    sql`${schema.messages.deletedAt} IS NULL`,
  ];
  if (hasSinceId) {
    conditions.push(gt(schema.messages.id, sinceId));
  }

  const chatMessages = await db
    .select({
      id: schema.messages.id,
      senderId: schema.messages.senderId,
      receiverId: schema.messages.receiverId,
      content: schema.messages.content,
      read: schema.messages.read,
      createdAt: schema.messages.createdAt,
      linkPreviewId: schema.messages.linkPreviewId,
      mediaUrl: schema.messages.mediaUrl,
      mediaType: schema.messages.mediaType,
      deliveredAt: schema.messages.deliveredAt,
      readAt: schema.messages.readAt,
      clientMessageId: schema.messages.clientMessageId,
    })
    .from(schema.messages)
    .where(and(...conditions))
    .orderBy(schema.messages.id)
    .all();

  // Mark undelivered messages addressed to the auth user as delivered (catch-up path).
  const undeliveredToMe = chatMessages.filter(
    m => m.receiverId === authUser.id && !m.deliveredAt,
  );
  if (undeliveredToMe.length > 0) {
    const deliveredAt = new Date().toISOString();
    const ids = undeliveredToMe.map(m => m.id);
    await db.update(schema.messages)
      .set({ deliveredAt })
      .where(
        and(
          inArray(schema.messages.id, ids),
          eq(schema.messages.receiverId, authUser.id),
          isNull(schema.messages.deliveredAt),
        ),
      )
      .run();

    for (const m of undeliveredToMe) {
      m.deliveredAt = deliveredAt;
    }

    const bySender = new Map<number, number[]>();
    for (const m of undeliveredToMe) {
      const list = bySender.get(m.senderId) ?? [];
      list.push(m.id);
      bySender.set(m.senderId, list);
    }
    await Promise.all(
      [...bySender.entries()].map(([senderId, messageIds]) =>
        broadcastMessageDelivered(c.env, senderId, messageIds, deliveredAt),
      ),
    );
  }

  const previewIds = [...new Set(chatMessages.map(m => m.linkPreviewId).filter((id): id is number => id !== null))];
  const previews = previewIds.length
    ? await db.select().from(schema.linkPreviews).where(inArray(schema.linkPreviews.id, previewIds)).all()
    : [];
  const previewById = new Map(previews.map(p => [p.id, p]));

  const senderIds = [...new Set(chatMessages.map(m => m.senderId))];
  const receiverIds = [...new Set(chatMessages.map(m => m.receiverId))];
  const userIds = [...new Set([...senderIds, ...receiverIds])];
  const userRows = userIds.length
    ? await db
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
        .all()
    : [];
  const usernameById = new Map(userRows.map(u => [u.id, u.username]));

  const populatedMessages: Message[] = chatMessages.map((msg) => {
    const preview = msg.linkPreviewId ? previewById.get(msg.linkPreviewId) : null;
    return toMessageDto({
      id: msg.id,
      senderId: msg.senderId,
      senderUsername: usernameById.get(msg.senderId) || 'Unknown',
      receiverId: msg.receiverId,
      receiverUsername: usernameById.get(msg.receiverId) || 'Unknown',
      content: msg.content,
      createdAt: msg.createdAt,
      read: msg.read,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      linkPreview: preview
        ? { url: preview.url, title: preview.title, description: preview.description, imageUrl: preview.imageUrl, siteName: preview.siteName }
        : null,
      mediaUrl: msg.mediaUrl,
      mediaType: msg.mediaType,
      clientMessageId: msg.clientMessageId,
    });
  });

  return c.json(populatedMessages);
});

export default messages;
