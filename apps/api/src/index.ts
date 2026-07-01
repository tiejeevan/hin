import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, count, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Post, Comment, Message, Notification, User } from '@hin/types';
import bcrypt from 'bcryptjs';
import { sign, verify } from 'hono/jwt';

interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
}

const JWT_SECRET = 'hin-super-secret-key-12345';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Helper to get authenticated user from JWT token
async function getAuthUser(c: any): Promise<any | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    const db = drizzle(c.env.DB, { schema });
    const user = await db.select().from(schema.users).where(eq(schema.users.id, payload.id as number)).get();
    return user || null;
  } catch (e) {
    return null;
  }
}

// Ensure Admin user is seeded in DB
async function seedAdminUser(db: any) {
  const username = 'admin';
  const existing = await db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (!existing) {
    const passwordHash = await bcrypt.hash('087425', 10);
    await db.insert(schema.users).values({
      username,
      passwordHash,
      role: 'admin',
    }).run();
  }
}

// Basic test endpoint
app.get('/', (c) => c.text('Hin API is running!'));

// 1. AUTH ENDPOINTS

// Register
app.post('/api/auth/register', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db); // Seed admin user if not exists

  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  
  if (!username || username.trim() === '') {
    return c.json({ error: 'Username is required' }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const normalizedUsername = username.trim().toLowerCase();

  // Check if exists
  const existing = await db.select().from(schema.users).where(eq(schema.users.username, normalizedUsername)).get();
  if (existing) {
    return c.json({ error: 'Username already taken' }, 400);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Insert user
  const [inserted] = await db.insert(schema.users).values({
    username: normalizedUsername,
    passwordHash,
    role: 'user',
  }).returning();

  // Generate JWT token
  const token = await sign({ 
    id: inserted.id, 
    username: inserted.username, 
    role: inserted.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: {
      id: inserted.id,
      username: inserted.username,
      role: inserted.role,
      createdAt: inserted.createdAt,
    }
  });
});

// Login
app.post('/api/auth/login', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db); // Seed admin user if not exists

  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  
  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const normalizedUsername = username.trim().toLowerCase();

  // Find user
  const user = await db.select().from(schema.users).where(eq(schema.users.username, normalizedUsername)).get();
  if (!user) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Compare passwords
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Generate JWT token
  const token = await sign({ 
    id: user.id, 
    username: user.username, 
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    }
  });
});

// Get all users (for chat list and user details)
app.get('/api/users', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const allUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
    createdAt: schema.users.createdAt,
  }).from(schema.users).all();

  return c.json(allUsers);
});

// Get posts
app.get('/api/posts', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  // Let's fetch posts with author details, likes count, and comments count.
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
  .where(sql`${schema.posts.deletedAt} IS NULL`) // Soft delete check
  .orderBy(desc(schema.posts.createdAt))
  .all();

  const postsWithMetadata: Post[] = await Promise.all(
    allPosts.map(async (post) => {
      // Likes count
      const likesRes = await db
        .select({ value: count() })
        .from(schema.likes)
        .where(eq(schema.likes.postId, post.id))
        .get();
      const likesCount = likesRes?.value || 0;

      // Comments count (excluding soft deleted comments that have no replies)
      const commentsRes = await db
        .select({ value: count() })
        .from(schema.comments)
        .where(
          and(
            eq(schema.comments.postId, post.id),
            sql`${schema.comments.deletedAt} IS NULL`
          )
        )
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
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const { content, mediaUrl } = await c.req.json<{ content: string; mediaUrl?: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const [inserted] = await db.insert(schema.posts).values({
    userId: authUser.id,
    content: content,
    mediaUrl: mediaUrl || null,
  }).returning();

  const responsePost: Post = {
    id: inserted.id,
    userId: authUser.id,
    username: authUser.username,
    content: inserted.content,
    mediaUrl: inserted.mediaUrl,
    createdAt: inserted.createdAt,
    likesCount: 0,
    commentsCount: 0,
    hasLiked: false,
  };

  // Broadcast new post in real-time to all online users
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'post_created', payload: { post: responsePost } }),
    }));
  } catch (e) {}

  return c.json(responsePost);
});

// Toggle Like
app.post('/api/posts/:id/like', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  // Get post details
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  // Check if already liked
  const existingLike = await db.select().from(schema.likes).where(
    and(
      eq(schema.likes.postId, postId),
      eq(schema.likes.userId, authUser.id)
    )
  ).get();

  let liked = false;
  if (existingLike) {
    // Unlike
    await db.delete(schema.likes).where(
      and(
        eq(schema.likes.postId, postId),
        eq(schema.likes.userId, authUser.id)
      )
    ).run();
  } else {
    // Like
    await db.insert(schema.likes).values({
      postId,
      userId: authUser.id,
    }).run();
    liked = true;

    // Send real-time notification to post owner if it's someone else
    if (post.userId !== authUser.id) {
      const notificationContent = `${authUser.username} liked your post.`;
      
      const [notif] = await db.insert(schema.notifications).values({
        userId: post.userId,
        senderId: authUser.id,
        type: 'like',
        entityId: postId,
        content: notificationContent,
        read: 0,
      }).returning();

      const notifPayload: Notification = {
        id: notif.id,
        userId: post.userId,
        senderId: authUser.id,
        senderUsername: authUser.username,
        type: 'like',
        entityId: postId,
        content: notificationContent,
        read: false,
        createdAt: notif.createdAt,
      };

      // Call Durable Object to send real-time update
      try {
        const doId = c.env.REALTIME_DO.idFromName('global');
        const doStub = c.env.REALTIME_DO.get(doId);
        await doStub.fetch(new Request('http://realtime/broadcast-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId: post.userId, notification: notifPayload }),
        }));
      } catch (e) {}
    }
  }

  // Count total likes
  const likesCountRes = await db.select({ value: count() }).from(schema.likes).where(eq(schema.likes.postId, postId)).get();
  const likesCount = likesCountRes?.value || 0;

  // Broadcast like update to ALL online users
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'like_update',
        payload: { postId, likesCount, userId: authUser.id, liked }
      }),
    }));
  } catch (e) {}

  return c.json({ liked, likesCount });
});

// Get post comments (including soft-deleted and parent information)
app.get('/api/posts/:id/comments', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const postComments = await db
    .select({
      id: schema.comments.id,
      postId: schema.comments.postId,
      userId: schema.comments.userId,
      parentId: schema.comments.parentId,
      content: schema.comments.content,
      createdAt: schema.comments.createdAt,
      deletedAt: schema.comments.deletedAt,
      username: schema.users.username,
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.postId, postId))
    .orderBy(desc(schema.comments.createdAt))
    .all();

  // Redact soft deleted comments content
  const redactedComments = postComments.map(comment => {
    if (comment.deletedAt) {
      return {
        ...comment,
        content: '[Comment deleted]',
        username: 'deleted',
      };
    }
    return comment;
  });

  return c.json(redactedComments);
});

// Create comment (allows parentId for loops)
app.post('/api/posts/:id/comments', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const { content, parentId } = await c.req.json<{ content: string; parentId?: number | null }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  // Insert comments (including optional parentId link)
  const [inserted] = await db.insert(schema.comments).values({
    postId,
    userId: authUser.id,
    parentId: parentId || null,
    content: content.trim(),
  }).returning();

  const commentResponse: Comment = {
    id: inserted.id,
    postId: inserted.postId,
    userId: authUser.id,
    username: authUser.username,
    parentId: inserted.parentId,
    content: inserted.content,
    createdAt: inserted.createdAt,
    deletedAt: inserted.deletedAt,
  };

  // Determine notification recipient: parent comment owner if a reply, else post owner
  let recipientId = post.userId;
  let notificationContent = `${authUser.username} commented on your post: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;

  if (parentId) {
    const parentComment = await db.select().from(schema.comments).where(eq(schema.comments.id, parentId)).get();
    if (parentComment && parentComment.userId !== authUser.id) {
      recipientId = parentComment.userId;
      notificationContent = `${authUser.username} replied to your comment: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;
    }
  }

  // Send real-time notification to recipient if it's someone else
  if (recipientId !== authUser.id) {
    const [notif] = await db.insert(schema.notifications).values({
      userId: recipientId,
      senderId: authUser.id,
      type: 'comment',
      entityId: postId,
      content: notificationContent,
      read: 0,
    }).returning();

    const notifPayload: Notification = {
      id: notif.id,
      userId: recipientId,
      senderId: authUser.id,
      senderUsername: authUser.username,
      type: 'comment',
      entityId: postId,
      content: notificationContent,
      read: false,
      createdAt: notif.createdAt,
    };

    // Call Durable Object to send real-time update
    try {
      const doId = c.env.REALTIME_DO.idFromName('global');
      const doStub = c.env.REALTIME_DO.get(doId);
      await doStub.fetch(new Request('http://realtime/broadcast-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, notification: notifPayload }),
      }));
    } catch (e) {}
  }

  // Broadcast comment creation to ALL online users
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'comment_created',
        payload: { comment: commentResponse }
      }),
    }));
  } catch (e) {}

  return c.json(commentResponse);
});

// Get direct messages history (filtering out soft deleted ones)
app.get('/api/messages/:otherUserId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const otherUserId = parseInt(c.req.param('otherUserId'));

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
      and(
        sql`(${schema.messages.senderId} = ${authUser.id} AND ${schema.messages.receiverId} = ${otherUserId}) OR 
            (${schema.messages.senderId} = ${otherUserId} AND ${schema.messages.receiverId} = ${authUser.id})`,
        sql`${schema.messages.deletedAt} IS NULL` // filter soft deleted messages
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
      };
    })
  );

  return c.json(populatedMessages);
});

// Get notifications
app.get('/api/notifications', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });

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
    .where(eq(schema.notifications.userId, authUser.id))
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
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const notifId = parseInt(c.req.param('id'));

  await db
    .update(schema.notifications)
    .set({ read: 1 })
    .where(
      and(
        eq(schema.notifications.id, notifId),
        eq(schema.notifications.userId, authUser.id)
      )
    )
    .run();

  return c.json({ success: true });
});

// 2. ADMIN ENDPOINTS

// Admin stats & user list
app.get('/api/admin/stats', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });

  const totalUsers = await db.select({ value: count() }).from(schema.users).get();
  const totalPosts = await db.select({ value: count() }).from(schema.posts).where(sql`${schema.posts.deletedAt} IS NULL`).get();
  const totalComments = await db.select({ value: count() }).from(schema.comments).where(sql`${schema.comments.deletedAt} IS NULL`).get();
  const totalMessages = await db.select({ value: count() }).from(schema.messages).where(sql`${schema.messages.deletedAt} IS NULL`).get();

  const allUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
    createdAt: schema.users.createdAt,
  }).from(schema.users).all();

  return c.json({
    stats: {
      users: totalUsers?.value || 0,
      posts: totalPosts?.value || 0,
      comments: totalComments?.value || 0,
      messages: totalMessages?.value || 0,
    },
    users: allUsers,
  });
});

// Delete Post (Owner or Admin) - Soft Delete
app.delete('/api/posts/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  // Fetch post details to authorize owner
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== post.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Soft delete post
  await db.update(schema.posts)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.posts.id, postId))
    .run();

  // Broadcast deletion in real-time
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'post_deleted', payload: { postId } }),
    }));
  } catch (e) {}

  return c.json({ success: true });
});

// Delete Comment (Owner or Admin) - Soft Delete
app.delete('/api/comments/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  // Fetch comment details to authorize owner
  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return c.json({ error: 'Comment not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== comment.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Soft delete comment
  await db.update(schema.comments)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.comments.id, commentId))
    .run();

  // Broadcast comment deletion in real-time to update client states
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comment_deleted', payload: { commentId, postId: comment.postId } }),
    }));
  } catch (e) {}

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
  // Map connected WebSockets to user details, and track their active chat recipient ID
  sessions = new Map<WebSocket, { userId: number; username: string; activeChatId?: number | null }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Endpoint for HTTP push notification broadcast from API worker (for targeted user notification)
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

    // Endpoint for HTTP event broadcast to ALL online users (feed changes, likes, comments)
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
      const { token } = message.payload;
      try {
        const payload = await verify(token, JWT_SECRET, 'HS256');
        const userId = payload.id as number;
        const username = payload.username as string;

        this.sessions.set(ws, { userId, username });
        this.broadcastOnlineUsers();
      } catch (e) {
        console.error('WebSocket token authentication failed:', e);
      }
    } 
    
    // Set the user's active chat context to suppress repeating alerts
    else if (message.type === 'active_chat') {
      const session = this.sessions.get(ws);
      if (session) {
        session.activeChatId = message.payload.recipientId;
      }
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

      // Send message to receiver if online, and check if they are viewing the chat
      let receiverIsViewingChat = false;
      for (const [targetWs, targetSession] of this.sessions.entries()) {
        if (targetSession.userId === receiverId) {
          try {
            targetWs.send(JSON.stringify({ type: 'message', payload: messagePayload }));
            if (targetSession.activeChatId === session.userId) {
              receiverIsViewingChat = true;
            }
          } catch (e) {}
        }
      }

      // Trigger notification records/events ONLY if recipient is not actively viewing the chat
      if (!receiverIsViewingChat) {
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

        // Dispatch notifications only to clients who are not viewing the chat
        for (const [targetWs, targetSession] of this.sessions.entries()) {
          if (targetSession.userId === receiverId && targetSession.activeChatId !== session.userId) {
            try {
              targetWs.send(JSON.stringify({ type: 'notification', payload: notificationPayload }));
            } catch (e) {}
          }
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
