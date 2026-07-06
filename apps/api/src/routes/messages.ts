import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Message } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { isBlocked } from '../lib/blocks';
import { countUnreadMessages, listMessageThreads } from '../lib/messages';

const messages = new Hono<{ Bindings: Env }>();

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
