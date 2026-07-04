import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, count, sql, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Post, Comment, Notification } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { linkPostMedia, parseMediaUrls, serializeMediaUrls, validateOwnedPostMedia } from '../lib/media';

const posts = new Hono<{ Bindings: Env }>();

// Get posts
posts.get('/', async (c) => {
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
    mediaUrls: schema.posts.mediaUrls,
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
        id: post.id,
        userId: post.userId,
        username: post.username,
        content: post.content,
        mediaUrls: parseMediaUrls(post.mediaUrls),
        createdAt: post.createdAt,
        likesCount,
        commentsCount,
        hasLiked,
      };
    })
  );

  return c.json(postsWithMetadata);
});

// Create post
posts.post('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const { content, mediaUrls: rawMediaUrls } = await c.req.json<{ content: string; mediaUrls?: string[] }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const mediaUrls = Array.isArray(rawMediaUrls) ? rawMediaUrls.filter(Boolean) : [];
  if (mediaUrls.length > 5) {
    return c.json({ error: 'Maximum 5 images allowed' }, 400);
  }
  if (mediaUrls.length > 0) {
    const validation = await validateOwnedPostMedia(db, authUser.id, mediaUrls);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }
  }

  const [inserted] = await db.insert(schema.posts).values({
    userId: authUser.id,
    content: content,
    mediaUrls: serializeMediaUrls(mediaUrls),
  }).returning();

  if (mediaUrls.length > 0) {
    await linkPostMedia(db, authUser.id, inserted.id, mediaUrls);
  }

  const responsePost: Post = {
    id: inserted.id,
    userId: authUser.id,
    username: authUser.username,
    content: inserted.content,
    mediaUrls: parseMediaUrls(inserted.mediaUrls),
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
posts.put('/:id', async (c) => {
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
      previousMediaUrls: post.mediaUrls,
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
    mediaUrls: parseMediaUrls(updated.mediaUrls),
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
posts.post('/:id/like', async (c) => {
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
posts.get('/:id/comments', async (c) => {
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
posts.post('/:id/comments', async (c) => {
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

// Delete Post (Owner or Admin) - Soft Delete
posts.delete('/:id', async (c) => {
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

export default posts;
