import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Comment } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';

const comments = new Hono<{ Bindings: Env }>();

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

export default comments;
