import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Post, Comment, Message, Notification, User } from '@hin/types';

interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'x-user-id'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Basic test endpoint
app.get('/', (c) => c.text('Hin API is running!'));

// Get all users (for mock login)
app.get('/api/users', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const allUsers = await db.select().from(schema.users).all();
  return c.json(allUsers);
});

// Create/Login user
app.post('/api/users', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const { username } = await c.req.json<{ username: string }>();
  
  if (!username || username.trim() === '') {
    return c.json({ error: 'Username is required' }, 400);
  }

  // Check if exists
  let user = await db.select().from(schema.users).where(eq(schema.users.username, username.trim())).get();
  
  if (!user) {
    // Create new
    const [inserted] = await db.insert(schema.users).values({
      username: username.trim(),
    }).returning();
    user = inserted;
  }

  return c.json(user);
});

// Get posts
app.get('/api/posts', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  const currentUserId = currentUserIdStr ? parseInt(currentUserIdStr) : null;

  // Let's fetch posts with author details, likes count, and comments count.
  // Using direct select statements and subqueries/aggregations for SQLite
  const allPosts = await db.select({
    id: schema.posts.id,
    userId: schema.posts.userId,
    content: schema.posts.content,
    mediaUrl: schema.posts.mediaUrl,
    createdAt: schema.posts.createdAt,
    username: schema.users.username,
  })
  .from(schema.posts)
  .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
  .orderBy(desc(schema.posts.createdAt))
  .all();

  // Map to include comments count, likes count, and hasLiked status
  const postsWithMetadata: Post[] = await Promise.all(
    allPosts.map(async (post) => {
      // Likes count
      const likesRes = await db
        .select({ value: count() })
        .from(schema.likes)
        .where(eq(schema.likes.postId, post.id))
        .get();
      const likesCount = likesRes?.value || 0;

      // Comments count
      const commentsRes = await db
        .select({ value: count() })
        .from(schema.comments)
        .where(eq(schema.comments.postId, post.id))
        .get();
      const commentsCount = commentsRes?.value || 0;

      // Checked if current user liked it
      let hasLiked = false;
      if (currentUserId) {
        const likeRecord = await db
          .select()
          .from(schema.likes)
          .where(
            and(
              eq(schema.likes.postId, post.id),
              eq(schema.likes.userId, currentUserId)
            )
          )
          .get();
        hasLiked = !!likeRecord;
      }

      return {
        ...post,
        likesCount,
        commentsCount,
        hasLiked,
      };
    })
  );

  return c.json(postsWithMetadata);
});

// Create post
app.post('/api/posts', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  
  if (!currentUserIdStr) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const currentUserId = parseInt(currentUserIdStr);

  const { content, mediaUrl } = await c.req.json<{ content: string; mediaUrl?: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const [inserted] = await db.insert(schema.posts).values({
    userId: currentUserId,
    content: content,
    mediaUrl: mediaUrl || null,
  }).returning();

  const author = await db.select().from(schema.users).where(eq(schema.users.id, currentUserId)).get();

  const responsePost: Post = {
    id: inserted.id,
    userId: currentUserId,
    username: author?.username || 'Unknown',
    content: inserted.content,
    mediaUrl: inserted.mediaUrl,
    createdAt: inserted.createdAt,
    likesCount: 0,
    commentsCount: 0,
    hasLiked: false,
  };

  return c.json(responsePost);
});

// Toggle Like
app.post('/api/posts/:id/like', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  if (!currentUserIdStr) return c.json({ error: 'Unauthorized' }, 401);
  const currentUserId = parseInt(currentUserIdStr);
  const postId = parseInt(c.req.param('id'));

  // Get post details
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  // Check if already liked
  const existingLike = await db.select().from(schema.likes).where(
    and(
      eq(schema.likes.postId, postId),
      eq(schema.likes.userId, currentUserId)
    )
  ).get();

  let liked = false;
  if (existingLike) {
    // Unlike
    await db.delete(schema.likes).where(
      and(
        eq(schema.likes.postId, postId),
        eq(schema.likes.userId, currentUserId)
      )
    ).run();
  } else {
    // Like
    await db.insert(schema.likes).values({
      postId,
      userId: currentUserId,
    }).run();
    liked = true;

    // Send real-time notification to post owner if it's someone else
    if (post.userId !== currentUserId) {
      const actor = await db.select().from(schema.users).where(eq(schema.users.id, currentUserId)).get();
      const notificationContent = `${actor?.username || 'Someone'} liked your post.`;
      
      const [notif] = await db.insert(schema.notifications).values({
        userId: post.userId,
        senderId: currentUserId,
        type: 'like',
        entityId: postId,
        content: notificationContent,
        read: 0,
      }).returning();

      const notifPayload: Notification = {
        id: notif.id,
        userId: post.userId,
        senderId: currentUserId,
        senderUsername: actor?.username || 'Someone',
        type: 'like',
        entityId: postId,
        content: notificationContent,
        read: false,
        createdAt: notif.createdAt,
      };

      // Call Durable Object to send real-time update
      const doId = c.env.REALTIME_DO.idFromName('global');
      const doStub = c.env.REALTIME_DO.get(doId);
      await doStub.fetch(new Request('http://realtime/broadcast-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: post.userId, notification: notifPayload }),
      }));
    }
  }

  // Count total likes
  const likesCountRes = await db.select({ value: count() }).from(schema.likes).where(eq(schema.likes.postId, postId)).get();

  return c.json({ liked, likesCount: likesCountRes?.value || 0 });
});

// Get post comments
app.get('/api/posts/:id/comments', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const postComments = await db
    .select({
      id: schema.comments.id,
      postId: schema.comments.postId,
      userId: schema.comments.userId,
      content: schema.comments.content,
      createdAt: schema.comments.createdAt,
      username: schema.users.username,
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.postId, postId))
    .orderBy(desc(schema.comments.createdAt))
    .all();

  return c.json(postComments);
});

// Create comment
app.post('/api/posts/:id/comments', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  if (!currentUserIdStr) return c.json({ error: 'Unauthorized' }, 401);
  const currentUserId = parseInt(currentUserIdStr);
  const postId = parseInt(c.req.param('id'));

  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  const [inserted] = await db.insert(schema.comments).values({
    postId,
    userId: currentUserId,
    content: content.trim(),
  }).returning();

  const author = await db.select().from(schema.users).where(eq(schema.users.id, currentUserId)).get();

  const commentResponse: Comment = {
    id: inserted.id,
    postId: inserted.postId,
    userId: currentUserId,
    username: author?.username || 'Unknown',
    content: inserted.content,
    createdAt: inserted.createdAt,
  };

  // Send real-time notification to post owner if it's someone else
  if (post.userId !== currentUserId) {
    const notificationContent = `${author?.username || 'Someone'} commented on your post: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;
    const [notif] = await db.insert(schema.notifications).values({
      userId: post.userId,
      senderId: currentUserId,
      type: 'comment',
      entityId: postId,
      content: notificationContent,
      read: 0,
    }).returning();

    const notifPayload: Notification = {
      id: notif.id,
      userId: post.userId,
      senderId: currentUserId,
      senderUsername: author?.username || 'Someone',
      type: 'comment',
      entityId: postId,
      content: notificationContent,
      read: false,
      createdAt: notif.createdAt,
    };

    // Call Durable Object to send real-time update
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: post.userId, notification: notifPayload }),
    }));
  }

  return c.json(commentResponse);
});

// Get direct messages history
app.get('/api/messages/:otherUserId', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  if (!currentUserIdStr) return c.json({ error: 'Unauthorized' }, 401);
  const currentUserId = parseInt(currentUserIdStr);
  const otherUserId = parseInt(c.req.param('otherUserId'));

  // Fetch messages between sender and receiver
  // WHERE (sender = userA AND receiver = userB) OR (sender = userB AND receiver = userA)
  const chatMessages = await db
    .select({
      id: schema.messages.id,
      senderId: schema.messages.senderId,
      receiverId: schema.messages.receiverId,
      content: schema.messages.content,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .where(
      sql`(${schema.messages.senderId} = ${currentUserId} AND ${schema.messages.receiverId} = ${otherUserId}) OR 
          (${schema.messages.senderId} = ${otherUserId} AND ${schema.messages.receiverId} = ${currentUserId})`
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
      };
    })
  );

  return c.json(populatedMessages);
});

// Get notifications
app.get('/api/notifications', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  if (!currentUserIdStr) return c.json({ error: 'Unauthorized' }, 401);
  const currentUserId = parseInt(currentUserIdStr);

  const rawNotifs = await db
    .select({
      id: schema.notifications.id,
      userId: schema.notifications.userId,
      senderId: schema.notifications.senderId,
      type: schema.notifications.type,
      entityId: schema.notifications.entityId,
      content: schema.notifications.content,
      read: schema.notifications.read,
      createdAt: schema.notifications.createdAt,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, currentUserId))
    .orderBy(desc(schema.notifications.createdAt))
    .all();

  const populatedNotifs: Notification[] = await Promise.all(
    rawNotifs.map(async (notif) => {
      const sender = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, notif.senderId)).get();
      return {
        id: notif.id,
        userId: notif.userId,
        senderId: notif.senderId,
        senderUsername: sender?.username || 'Someone',
        type: notif.type as any,
        entityId: notif.entityId,
        content: notif.content,
        read: notif.read === 1,
        createdAt: notif.createdAt,
      };
    })
  );

  return c.json(populatedNotifs);
});

// Mark notification as read
app.post('/api/notifications/:id/read', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const currentUserIdStr = c.req.header('x-user-id');
  if (!currentUserIdStr) return c.json({ error: 'Unauthorized' }, 401);
  const currentUserId = parseInt(currentUserIdStr);
  const notifId = parseInt(c.req.param('id'));

  await db
    .update(schema.notifications)
    .set({ read: 1 })
    .where(
      and(
        eq(schema.notifications.id, notifId),
        eq(schema.notifications.userId, currentUserId)
      )
    )
    .run();

  return c.json({ success: true });
});

// WebSocket entrypoint -> route to Durable Object
app.get('/ws', async (c) => {
  const doId = c.env.REALTIME_DO.idFromName('global');
  const doStub = c.env.REALTIME_DO.get(doId);
  return doStub.fetch(c.req.raw);
});

// Export Hono app
export default app;

// --- DURABLE OBJECT IMPLEMENTATION ---

export class RealtimeDO implements DurableObject {
  state: DurableObjectState;
  env: Env;
  // Map connected WebSockets to user details
  sessions = new Map<WebSocket, { userId: number; username: string }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint for HTTP push notification broadcast from API worker
    if (url.pathname === '/broadcast-notification') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const { recipientId, notification } = await request.json() as { recipientId: number; notification: Notification };
      
      // Dispatch notification to user's web sockets
      for (const [ws, session] of this.sessions.entries()) {
        if (session.userId === recipientId) {
          try {
            ws.send(JSON.stringify({ type: 'notification', payload: notification }));
          } catch (e) {
            // Socket is closed or errored, session will be cleaned up
          }
        }
      }
      return new Response('OK');
    }

    // Otherwise, upgrade to WebSocket
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept server-side web socket
    server.accept();

    // Set up message handlers
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
      const { userId, username } = message.payload;
      this.sessions.set(ws, { userId, username });
      this.broadcastOnlineUsers();
    } 
    
    else if (message.type === 'send_message') {
      const session = this.sessions.get(ws);
      if (!session) return;

      const { receiverId, content } = message.payload;
      
      // Save message to D1
      const [inserted] = await db.insert(schema.messages).values({
        senderId: session.userId,
        receiverId,
        content,
      }).returning();

      // Fetch recipient details
      const receiverUser = await db.select().from(schema.users).where(eq(schema.users.id, receiverId)).get();

      const messagePayload: Message = {
        id: inserted.id,
        senderId: session.userId,
        senderUsername: session.username,
        receiverId,
        receiverUsername: receiverUser?.username || 'Unknown',
        content,
        createdAt: inserted.createdAt,
      };

      // Send message response to sender
      try {
        ws.send(JSON.stringify({ type: 'message', payload: messagePayload }));
      } catch (e) {}

      // Send message to receiver if online
      for (const [targetWs, targetSession] of this.sessions.entries()) {
        if (targetSession.userId === receiverId) {
          try {
            targetWs.send(JSON.stringify({ type: 'message', payload: messagePayload }));
          } catch (e) {}
        }
      }

      // Also trigger a real-time notification for the messaging
      const notificationContent = `${session.username} sent you a message: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;
      
      const [notif] = await db.insert(schema.notifications).values({
        userId: receiverId,
        senderId: session.userId,
        type: 'message',
        entityId: inserted.id,
        content: notificationContent,
        read: 0,
      }).returning();

      const notificationPayload: Notification = {
        id: notif.id,
        userId: receiverId,
        senderId: session.userId,
        senderUsername: session.username,
        type: 'message',
        entityId: inserted.id,
        content: notificationContent,
        read: false,
        createdAt: notif.createdAt,
      };

      // Dispatch notification
      for (const [targetWs, targetSession] of this.sessions.entries()) {
        if (targetSession.userId === receiverId) {
          try {
            targetWs.send(JSON.stringify({ type: 'notification', payload: notificationPayload }));
          } catch (e) {}
        }
      }
    }
  }

  handleClose(ws: WebSocket) {
    if (this.sessions.has(ws)) {
      this.sessions.delete(ws);
      this.broadcastOnlineUsers();
    }
  }

  broadcastOnlineUsers() {
    const userIds = Array.from(new Set(Array.from(this.sessions.values()).map((s) => s.userId)));
    const msg = JSON.stringify({ type: 'online_users', payload: { userIds } });
    
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(msg);
      } catch (e) {}
    }
  }
}
