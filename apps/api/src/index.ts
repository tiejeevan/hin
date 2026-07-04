import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, count, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Post, Comment, Message, Notification, User } from '@hin/types';
import bcrypt from 'bcryptjs';
import { sign, verify } from 'hono/jwt';

interface Env {
  DB: D1Database;
  REALTIME_DO: DurableObjectNamespace;
  MEDIA: R2Bucket;
}

const JWT_SECRET = 'hin-super-secret-key-12345';

function toPublicUser(
  user: {
    id: number;
    username: string;
    role: string;
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    createdAt: string;
    deletedAt?: string | null;
  },
  postCount?: number
): User {
  return {
    id: user.id,
    username: user.username,
    role: user.role as User['role'],
    bio: user.bio ?? null,
    avatarUrl: user.avatarUrl ?? null,
    coverUrl: user.coverUrl ?? null,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt ?? null,
    ...(postCount !== undefined ? { postCount } : {}),
  };
}

const USER_PUBLIC_FIELDS = {
  id: schema.users.id,
  username: schema.users.username,
  role: schema.users.role,
  bio: schema.users.bio,
  avatarUrl: schema.users.avatarUrl,
  coverUrl: schema.users.coverUrl,
  createdAt: schema.users.createdAt,
};

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
    const user = await db.select().from(schema.users)
      .where(
        and(
          eq(schema.users.id, payload.id as number),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .get();
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
    user: toPublicUser(inserted),
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

  // Find user (filtering out soft deleted ones)
  const user = await db.select().from(schema.users)
    .where(
      and(
        eq(schema.users.username, normalizedUsername),
        sql`${schema.users.deletedAt} IS NULL`
      )
    )
    .get();

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
    user: toPublicUser(user),
  });
});

// Get all users (for chat list and user details)
app.get('/api/users', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const allUsers = await db.select(USER_PUBLIC_FIELDS)
  .from(schema.users)
  .where(sql`${schema.users.deletedAt} IS NULL`) // Skip soft deleted users
  .all();

  return c.json(allUsers.map(u => toPublicUser(u)));
});

// Get single user profile
app.get('/api/users/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const user = await db.select(USER_PUBLIC_FIELDS)
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        sql`${schema.users.deletedAt} IS NULL`
      )
    )
    .get();

  if (!user) return c.json({ error: 'User not found' }, 404);

  const postCountRes = await db.select({ value: count() })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.userId, userId),
        sql`${schema.posts.deletedAt} IS NULL`
      )
    )
    .get();

  return c.json(toPublicUser(user, postCountRes?.value || 0));
});

// Update own profile
app.patch('/api/users/me', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ bio?: string | null; avatarUrl?: string | null; coverUrl?: string | null }>();
  const updates: Partial<{ bio: string | null; avatarUrl: string | null; coverUrl: string | null }> = {};

  if (body.bio !== undefined) {
    if (body.bio !== null && body.bio.length > 500) {
      return c.json({ error: 'Bio is too long (max 500 characters)' }, 400);
    }
    updates.bio = body.bio === null ? null : body.bio.trim();
  }
  if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;
  if (body.coverUrl !== undefined) updates.coverUrl = body.coverUrl;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [updated] = await db.update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, authUser.id))
    .returning();

  return c.json(toPublicUser(updated));
});

// Upload profile image to R2
app.post('/api/upload', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const formData = await c.req.formData();
  const file = formData.get('file');
  const uploadType = formData.get('type');

  if (!(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }
  if (uploadType !== 'avatar' && uploadType !== 'cover') {
    return c.json({ error: 'Invalid upload type' }, 400);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 5MB)' }, 400);
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const folder = uploadType === 'avatar' ? 'avatars' : 'covers';
  const key = `${folder}/${authUser.id}/${crypto.randomUUID()}.${ext}`;

  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const origin = new URL(c.req.url).origin;
  return c.json({ url: `${origin}/api/media/${key}`, key });
});

// Serve uploaded media from R2
app.get('/api/media/*', async (c) => {
  const key = c.req.path.replace(/^\/api\/media\//, '');
  if (!key) return c.notFound();

  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

// Get posts
app.get('/api/posts', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  // Let's fetch posts with author details, likes count, and comments count.
  const filterUserId = c.req.query('userId');
  const postConditions = [
    sql`${schema.posts.deletedAt} IS NULL`,
    sql`${schema.users.deletedAt} IS NULL`,
  ];

  if (filterUserId) {
    const uid = parseInt(filterUserId);
    if (isNaN(uid)) return c.json({ error: 'Invalid userId' }, 400);
    postConditions.push(eq(schema.posts.userId, uid));
  }

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
  .where(and(...postConditions))
  .orderBy(desc(schema.posts.createdAt))
  .all();

  const postsWithMetadata: Post[] = await Promise.all(
    allPosts.map(async (post) => {
      // Likes count
      const likesRes = await db
        .select({ value: count() })
        .from(schema.likes)
        .where(
          and(
            eq(schema.likes.postId, post.id),
            isNull(schema.likes.deletedAt)
          )
        )
        .get();
      const likesCount = likesRes?.value || 0;

      // Comments count
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
              eq(schema.likes.userId, currentUserId),
              isNull(schema.likes.deletedAt)
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

  // Broadcast new post in real-time
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

// Edit Post (Owner or Admin)
app.put('/api/posts/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== post.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  // Preserve previous version for admin/system audit trail
  if (content.trim() !== post.content) {
    await db.insert(schema.postEditHistory).values({
      postId,
      previousContent: post.content,
      previousMediaUrl: post.mediaUrl,
      editedBy: authUser.id,
    }).run();
  }

  const [updated] = await db.update(schema.posts)
    .set({ content: content.trim() })
    .where(eq(schema.posts.id, postId))
    .returning();

  const likesRes = await db.select({ value: count() }).from(schema.likes).where(and(eq(schema.likes.postId, postId), isNull(schema.likes.deletedAt))).get();
  const commentsRes = await db.select({ value: count() }).from(schema.comments).where(and(eq(schema.comments.postId, postId), sql`${schema.comments.deletedAt} IS NULL`)).get();

  const likeRecord = await db.select().from(schema.likes).where(and(eq(schema.likes.postId, postId), eq(schema.likes.userId, authUser.id), isNull(schema.likes.deletedAt))).get();
  const author = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, updated.userId)).get();

  const responsePost: Post = {
    id: updated.id,
    userId: updated.userId,
    username: author?.username || 'Unknown',
    content: updated.content,
    mediaUrl: updated.mediaUrl,
    createdAt: updated.createdAt,
    likesCount: likesRes?.value || 0,
    commentsCount: commentsRes?.value || 0,
    hasLiked: !!likeRecord,
  };

  // Broadcast post edit
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'post_updated', payload: { post: responsePost } }),
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
    if (!existingLike.deletedAt) {
      // Unlike: Soft delete the existing active like record
      await db.update(schema.likes)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.likes.postId, postId),
            eq(schema.likes.userId, authUser.id)
          )
        ).run();
    } else {
      // Like: Re-activate the existing soft-deleted like record
      await db.update(schema.likes)
        .set({ deletedAt: null })
        .where(
          and(
            eq(schema.likes.postId, postId),
            eq(schema.likes.userId, authUser.id)
          )
        ).run();
      liked = true;
      // Do NOT notify again since the user has already liked this post before!
    }
  } else {
    // First time like: Insert a new like record
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

  // Count total active likes
  const likesCountRes = await db.select({ value: count() }).from(schema.likes).where(and(eq(schema.likes.postId, postId), isNull(schema.likes.deletedAt))).get();
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

// Get post comments
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

// Create comment
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

  // Insert comment
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

  // Determine recipient
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

  // Broadcast comment creation
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

// Edit Comment (Owner or Admin)
app.put('/api/comments/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return c.json({ error: 'Comment not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== comment.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const [updated] = await db.update(schema.comments)
    .set({ content: content.trim() })
    .where(eq(schema.comments.id, commentId))
    .returning();

  const author = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, updated.userId)).get();

  const commentResponse: Comment = {
    id: updated.id,
    postId: updated.postId,
    userId: updated.userId,
    username: author?.username || 'Unknown',
    parentId: updated.parentId,
    content: updated.content,
    createdAt: updated.createdAt,
    deletedAt: updated.deletedAt,
  };

  // Broadcast comment update
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comment_updated', payload: { comment: commentResponse } }),
    }));
  } catch (e) {}

  return c.json(commentResponse);
});

// Get DM threads list (other users with last message preview and unread count)
app.get('/api/messages/threads', async (c) => {
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

  if (partnerIds.length === 0) {
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
      inArray(schema.users.id, partnerIds),
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

// Get direct messages history
app.get('/api/messages/:otherUserId', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const otherUserId = parseInt(c.req.param('otherUserId'));

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

// Mark messages from a specific user as read
app.post('/api/messages/read/:otherUserId', async (c) => {
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

// Admin stats & user list (filtering out deleted users)
app.get('/api/admin/stats', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });

  const totalUsers = await db.select({ value: count() }).from(schema.users).where(sql`${schema.users.deletedAt} IS NULL`).get();
  const totalPosts = await db.select({ value: count() }).from(schema.posts).where(sql`${schema.posts.deletedAt} IS NULL`).get();
  const totalComments = await db.select({ value: count() }).from(schema.comments).where(sql`${schema.comments.deletedAt} IS NULL`).get();
  const totalMessages = await db.select({ value: count() }).from(schema.messages).where(sql`${schema.messages.deletedAt} IS NULL`).get();

  const allUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
    createdAt: schema.users.createdAt,
  })
  .from(schema.users)
  .where(sql`${schema.users.deletedAt} IS NULL`)
  .all();

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

// Admin Impersonation Endpoint
app.post('/api/admin/impersonate', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { userId } = await c.req.json<{ userId: number }>();
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const targetUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!targetUser) {
    return c.json({ error: 'User not found' }, 404);
  }
  if (targetUser.deletedAt) {
    return c.json({ error: 'Cannot impersonate a deleted user' }, 400);
  }

  // Generate delegation token for target user
  const token = await sign({ 
    id: targetUser.id, 
    username: targetUser.username, 
    role: targetUser.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: {
      id: targetUser.id,
      username: targetUser.username,
      role: targetUser.role,
      createdAt: targetUser.createdAt,
    }
  });
});

// Admin User Role Update
app.put('/api/admin/users/:id/role', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (userId === authUser.id) {
    return c.json({ error: 'Cannot change your own role' }, 400);
  }

  const { role } = await c.req.json<{ role: 'user' | 'admin' }>();
  if (role !== 'user' && role !== 'admin') {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  await db.update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ success: true });
});

// Admin User Soft Delete
app.delete('/api/admin/users/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (userId === authUser.id) {
    return c.json({ error: 'Cannot delete your own admin account' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Soft delete user
  await db.update(schema.users)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ success: true });
});

// Delete Post (Owner or Admin) - Soft Delete
app.delete('/api/posts/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== post.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(schema.posts)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.posts.id, postId))
    .run();

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

  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return c.json({ error: 'Comment not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== comment.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(schema.comments)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.comments.id, commentId))
    .run();

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
  sessions = new Map<WebSocket, { userId: number; username: string; activeChatId?: number | null }>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
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

        this.sessions.set(ws, { userId, username });
        this.broadcastOnlineUsers();
        try {
          ws.send(JSON.stringify({ type: 'joined', payload: { userId } }));
        } catch (e) {}
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
