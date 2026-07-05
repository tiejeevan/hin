import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, count, sql, inArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Message } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { isBlocked } from '../lib/blocks';

const messages = new Hono<{ Bindings: Env }>();

// Get DM threads list (other users with last message preview and unread count)
messages.get('/threads', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

  // 1. Fetch senderId and receiverId of messages involving authUser
  const messagePartners = await db.select({
    senderId: schema.messages.senderId,
    receiverId: schema.messages.receiverId,
  })
  .from(schema.messages)
  .where(
    and(
      sql`(${schema.messages.senderId} = ${authUser.id} OR ${schema.messages.receiverId} = ${authUser.id})`,
      sql`${schema.messages.deletedAt} IS NULL`
    )
  )
  .all();

  // 2. Extract unique partner IDs (excluding current user)
  const partnerIds = Array.from(new Set(
    messagePartners.flatMap(m => [m.senderId, m.receiverId]).filter(id => id !== authUser.id)
  ));

  const visiblePartnerIds: number[] = [];
  for (const partnerId of partnerIds) {
    if (!await isBlocked(db, authUser.id, partnerId)) {
      visiblePartnerIds.push(partnerId);
    }
  }

  if (visiblePartnerIds.length === 0) {
    return c.json([]);
  }

  // 3. Fetch detailed user records for those partner IDs
  const otherUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
  })
  .from(schema.users)
  .where(
    and(
      inArray(schema.users.id, visiblePartnerIds),
      sql`${schema.users.deletedAt} IS NULL`
    )
  )
  .all();

  const threads = await Promise.all(
    otherUsers.map(async (u) => {
      // Get last message in conversation
      const lastMsg = await db.select()
        .from(schema.messages)
        .where(
          and(
            sql`(${schema.messages.senderId} = ${authUser.id} AND ${schema.messages.receiverId} = ${u.id}) OR 
                (${schema.messages.senderId} = ${u.id} AND ${schema.messages.receiverId} = ${authUser.id})`,
            sql`${schema.messages.deletedAt} IS NULL`
          )
        )
        .orderBy(desc(schema.messages.createdAt))
        .get();

      // Count unread messages received from this user
      const unread = await db.select({ value: count() })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.senderId, u.id),
            eq(schema.messages.receiverId, authUser.id),
            eq(schema.messages.read, 0),
            sql`${schema.messages.deletedAt} IS NULL`
          )
        )
        .get();

      return {
        id: u.id,
        username: u.username,
        role: u.role,
        lastMessage: lastMsg ? {
          content: lastMsg.content,
          senderId: lastMsg.senderId,
          createdAt: lastMsg.createdAt,
          read: lastMsg.read === 1,
        } : null,
        unreadCount: unread?.value || 0,
      };
    })
  );

  return c.json(threads);
});

// Mark messages from a specific user as read (before /:otherUserId)
messages.post('/read/:otherUserId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const otherUserId = parseInt(c.req.param('otherUserId'));

  await db.update(schema.messages)
    .set({ read: 1 })
    .where(
      and(
        eq(schema.messages.senderId, otherUserId),
        eq(schema.messages.receiverId, authUser.id),
        eq(schema.messages.read, 0)
      )
    )
    .run();

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-read-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: otherUserId, receiverId: authUser.id }),
    }));
  } catch (e) {}

  return c.json({ success: true });
});

// Get direct messages history
messages.get('/:otherUserId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const otherUserId = parseInt(c.req.param('otherUserId'));

  if (await isBlocked(db, authUser.id, otherUserId)) {
    return c.json({ error: 'Cannot message this user' }, 403);
  }

  // Mark received messages as read
  await db.update(schema.messages)
    .set({ read: 1 })
    .where(
      and(
        eq(schema.messages.senderId, otherUserId),
        eq(schema.messages.receiverId, authUser.id),
        eq(schema.messages.read, 0)
      )
    )
    .run();

  // Also broadcast read status to sender if online
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-read-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: otherUserId, receiverId: authUser.id }),
    }));
  } catch (e) {}

  const chatMessages = await db
    .select({
      id: schema.messages.id,
      senderId: schema.messages.senderId,
      receiverId: schema.messages.receiverId,
      content: schema.messages.content,
      read: schema.messages.read,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .where(
      and(
        sql`(${schema.messages.senderId} = ${authUser.id} AND ${schema.messages.receiverId} = ${otherUserId}) OR 
            (${schema.messages.senderId} = ${otherUserId} AND ${schema.messages.receiverId} = ${authUser.id})`,
        sql`${schema.messages.deletedAt} IS NULL`
      )
    )
    .orderBy(schema.messages.createdAt)
    .all();

  // Populate usernames
  const populatedMessages: Message[] = await Promise.all(
    chatMessages.map(async (msg) => {
      const sender = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, msg.senderId)).get();
      const receiver = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, msg.receiverId)).get();

      return {
        id: msg.id,
        senderId: msg.senderId,
        senderUsername: sender?.username || 'Unknown',
        receiverId: msg.receiverId,
        receiverUsername: receiver?.username || 'Unknown',
        content: msg.content,
        createdAt: msg.createdAt,
        read: msg.read === 1,
      };
    })
  );

  return c.json(populatedMessages);
});

export default messages;
