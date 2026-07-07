import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, and, count, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Comment, Notification } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getOrCreateUserSettings, isNotificationEnabled } from '../lib/user-settings';
import { shouldDeliverNotification } from '../lib/blocks';
import { processUserActionSafe } from '../lib/gamification/hub';

const comments = new Hono<{ Bindings: Env }>();

async function getCommentLikesMeta(
  db: ReturnType<typeof drizzle<typeof schema>>,
  commentId: number,
  currentUserId: number | null
) {
  const likesCountRes = await db
    .select({ value: count() })
    .from(schema.commentLikes)
    .where(and(eq(schema.commentLikes.commentId, commentId), isNull(schema.commentLikes.deletedAt)))
    .get();
  const likesCount = likesCountRes?.value || 0;

  let hasLiked = false;
  if (currentUserId) {
    const likeRecord = await db
      .select()
      .from(schema.commentLikes)
      .where(
        and(
          eq(schema.commentLikes.commentId, commentId),
          eq(schema.commentLikes.userId, currentUserId),
          isNull(schema.commentLikes.deletedAt)
        )
      )
      .get();
    hasLiked = !!likeRecord;
  }

  return { likesCount, hasLiked };
}

// Toggle comment like
comments.post('/:id/like', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment || comment.deletedAt) return c.json({ error: 'Comment not found' }, 404);

  const existingLike = await db
    .select()
    .from(schema.commentLikes)
    .where(
      and(
        eq(schema.commentLikes.commentId, commentId),
        eq(schema.commentLikes.userId, authUser.id)
      )
    )
    .get();

  let liked = false;
  if (existingLike) {
    if (!existingLike.deletedAt) {
      await db
        .update(schema.commentLikes)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.commentLikes.commentId, commentId),
            eq(schema.commentLikes.userId, authUser.id)
          )
        )
        .run();
    } else {
      await db
        .update(schema.commentLikes)
        .set({ deletedAt: null })
        .where(
          and(
            eq(schema.commentLikes.commentId, commentId),
            eq(schema.commentLikes.userId, authUser.id)
          )
        )
        .run();
      liked = true;
    }
  } else {
    await db
      .insert(schema.commentLikes)
      .values({
        commentId,
        userId: authUser.id,
      })
      .run();
    liked = true;

    if (comment.userId !== authUser.id) {
      const recipientSettings = await getOrCreateUserSettings(db, comment.userId);
      if (
        isNotificationEnabled(recipientSettings, 'like')
        && await shouldDeliverNotification(db, comment.userId, authUser.id)
      ) {
        const notificationContent = `${authUser.username} liked your comment.`;
        const [notif] = await db
          .insert(schema.notifications)
          .values({
            userId: comment.userId,
            senderId: authUser.id,
            type: 'like',
            entityType: 'post',
            entityId: comment.postId,
            commentId: comment.id,
            content: notificationContent,
            read: 0,
          })
          .returning();

        const notifPayload: Notification = {
          id: notif.id,
          userId: comment.userId,
          senderId: authUser.id,
          senderUsername: authUser.username,
          type: 'like',
          entityType: 'post',
          entityId: comment.postId,
          commentId: comment.id,
          content: notificationContent,
          read: false,
          createdAt: notif.createdAt,
        };

        try {
          const doId = c.env.REALTIME_DO.idFromName('global');
          const doStub = c.env.REALTIME_DO.get(doId);
          await doStub.fetch(
            new Request('http://realtime/broadcast-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipientId: comment.userId, notification: notifPayload }),
            })
          );
        } catch (e) {}
      }
    }
  }

  const likesCountRes = await db
    .select({ value: count() })
    .from(schema.commentLikes)
    .where(and(eq(schema.commentLikes.commentId, commentId), isNull(schema.commentLikes.deletedAt)))
    .get();
  const likesCount = likesCountRes?.value || 0;

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'comment_like_update',
          payload: {
            commentId,
            postId: comment.postId,
            likesCount,
            userId: authUser.id,
            liked,
          },
        }),
      })
    );
  } catch (e) {}

  return c.json({ liked, likesCount });
});

// Edit Comment (Owner or Admin)
comments.put('/:id', async (c) => {
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

  const [updated] = await db
    .update(schema.comments)
    .set({ content: content.trim() })
    .where(eq(schema.comments.id, commentId))
    .returning();

  const author = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, updated.userId))
    .get();

  const { likesCount, hasLiked } = await getCommentLikesMeta(db, commentId, authUser.id);

  const commentResponse: Comment = {
    id: updated.id,
    postId: updated.postId,
    userId: updated.userId,
    username: author?.username || 'Unknown',
    parentId: updated.parentId,
    content: updated.content,
    createdAt: updated.createdAt,
    deletedAt: updated.deletedAt,
    likesCount,
    hasLiked,
  };

  // Broadcast comment update
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'comment_updated', payload: { comment: commentResponse } }),
      })
    );
  } catch (e) {}

  return c.json(commentResponse);
});

// Delete Comment (Owner or Admin) - Soft Delete
comments.delete('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return c.json({ error: 'Comment not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== comment.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db
    .update(schema.comments)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.comments.id, commentId))
    .run();

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'comment_deleted', payload: { commentId, postId: comment.postId } }),
      })
    );
  } catch (e) {}

  await processUserActionSafe(
    db,
    c.env,
    comment.userId,
    'comment_deleted',
    { postId: comment.postId, commentId },
    authUser.username,
  );

  return c.json({ success: true });
});

export default comments;
