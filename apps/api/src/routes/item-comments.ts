import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, and, count, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { ItemComment, Notification } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getOrCreateUserSettings, isNotificationEnabled } from '../lib/user-settings';
import { shouldDeliverNotification } from '../lib/blocks';
import { processUserActionSafe } from '../lib/gamification/hub';
import { isGamificationEnabled } from '../lib/gamification/settings';
import { getEquippedBadgesForUser } from '../lib/gamification/equipped';
import { isOlabidEnabled } from '../lib/system-settings';

const itemComments = new Hono<{ Bindings: Env }>();

/** Kill-switch: item discussion is part of Olabid — 404 when the feature is off. */
itemComments.use('*', async (c, next) => {
  const db = drizzle(c.env.DB, { schema });
  if (!(await isOlabidEnabled(db))) {
    return c.json({ error: 'Not found' }, 404);
  }
  return next();
});

async function getItemCommentLikesMeta(
  db: ReturnType<typeof drizzle<typeof schema>>,
  commentId: number,
  currentUserId: number | null
) {
  const likesCountRes = await db
    .select({ value: count() })
    .from(schema.itemCommentLikes)
    .where(and(eq(schema.itemCommentLikes.commentId, commentId), isNull(schema.itemCommentLikes.deletedAt)))
    .get();
  const likesCount = likesCountRes?.value || 0;

  let hasLiked = false;
  if (currentUserId) {
    const likeRecord = await db
      .select()
      .from(schema.itemCommentLikes)
      .where(
        and(
          eq(schema.itemCommentLikes.commentId, commentId),
          eq(schema.itemCommentLikes.userId, currentUserId),
          isNull(schema.itemCommentLikes.deletedAt)
        )
      )
      .get();
    hasLiked = !!likeRecord;
  }

  return { likesCount, hasLiked };
}

// Toggle item comment like
itemComments.post('/:id/like', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  const comment = await db.select().from(schema.itemComments).where(eq(schema.itemComments.id, commentId)).get();
  if (!comment || comment.deletedAt) return c.json({ error: 'Comment not found' }, 404);

  const existingLike = await db
    .select()
    .from(schema.itemCommentLikes)
    .where(
      and(
        eq(schema.itemCommentLikes.commentId, commentId),
        eq(schema.itemCommentLikes.userId, authUser.id)
      )
    )
    .get();

  let liked = false;
  if (existingLike) {
    if (!existingLike.deletedAt) {
      await db
        .update(schema.itemCommentLikes)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.itemCommentLikes.commentId, commentId),
            eq(schema.itemCommentLikes.userId, authUser.id)
          )
        )
        .run();
      liked = false;
    } else {
      await db
        .update(schema.itemCommentLikes)
        .set({ deletedAt: null, createdAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.itemCommentLikes.commentId, commentId),
            eq(schema.itemCommentLikes.userId, authUser.id)
          )
        )
        .run();
      liked = true;
    }
  } else {
    await db.insert(schema.itemCommentLikes).values({
      commentId,
      userId: authUser.id,
    }).run();
    liked = true;
  }

  if (liked && comment.userId !== authUser.id) {
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
          entityType: 'olabid_item',
          entityId: comment.olabidItemId,
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
        entityType: 'olabid_item',
        entityId: comment.olabidItemId,
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

  const likesCountRes = await db
    .select({ value: count() })
    .from(schema.itemCommentLikes)
    .where(and(eq(schema.itemCommentLikes.commentId, commentId), isNull(schema.itemCommentLikes.deletedAt)))
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
          type: 'item_comment_like_update',
          payload: {
            commentId,
            olabidItemId: comment.olabidItemId,
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

// Edit item comment (owner or admin)
itemComments.put('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  const comment = await db.select().from(schema.itemComments).where(eq(schema.itemComments.id, commentId)).get();
  if (!comment) return c.json({ error: 'Comment not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== comment.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const [updated] = await db
    .update(schema.itemComments)
    .set({ content: content.trim() })
    .where(eq(schema.itemComments.id, commentId))
    .returning();

  const author = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, updated.userId))
    .get();

  const { likesCount, hasLiked } = await getItemCommentLikesMeta(db, commentId, authUser.id);
  const authorEquippedBadges = (await isGamificationEnabled(db))
    ? await getEquippedBadgesForUser(db, updated.userId)
    : [];

  const commentResponse: ItemComment = {
    id: updated.id,
    olabidItemId: updated.olabidItemId,
    userId: updated.userId,
    username: author?.username || 'Unknown',
    parentId: updated.parentId,
    content: updated.content,
    createdAt: updated.createdAt,
    deletedAt: updated.deletedAt,
    likesCount,
    hasLiked,
    authorEquippedBadges,
  };

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'item_comment_updated', payload: { comment: commentResponse } }),
      })
    );
  } catch (e) {}

  return c.json(commentResponse);
});

// Delete item comment (owner or admin) — soft delete
itemComments.delete('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const commentId = parseInt(c.req.param('id'));

  const comment = await db.select().from(schema.itemComments).where(eq(schema.itemComments.id, commentId)).get();
  if (!comment) return c.json({ error: 'Comment not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== comment.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db
    .update(schema.itemComments)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.itemComments.id, commentId))
    .run();

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(
      new Request('http://realtime/broadcast-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'item_comment_deleted', payload: { commentId, olabidItemId: comment.olabidItemId } }),
      })
    );
  } catch (e) {}

  await processUserActionSafe(
    db,
    c.env,
    comment.userId,
    'comment_deleted',
    { olabidItemId: comment.olabidItemId, commentId },
    authUser.username,
  );

  return c.json({ success: true });
});

export default itemComments;
