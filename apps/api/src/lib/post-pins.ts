import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, isNotNull, count } from 'drizzle-orm';
import * as schema from '@hin/db';
import { getMaxPinnedPosts } from './system-settings';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function pinPost(
  db: Db,
  userId: number,
  postId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const post = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .get();

  if (!post || post.deletedAt) {
    return { ok: false, error: 'Post not found', code: 404 };
  }
  if (post.userId !== userId) {
    return { ok: false, error: 'Forbidden', code: 403 };
  }
  if (post.parentPostId) {
    return { ok: false, error: 'Only root posts can be pinned', code: 400 };
  }
  if (post.pinnedAt) {
    return { ok: true };
  }

  const maxPinned = await getMaxPinnedPosts(db);
  if (maxPinned === 0) {
    return { ok: false, error: 'Pinning is disabled', code: 400 };
  }

  const pinnedCountRes = await db
    .select({ value: count() })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.userId, userId),
        isNull(schema.posts.deletedAt),
        isNotNull(schema.posts.pinnedAt),
      ),
    )
    .get();

  const pinnedCount = pinnedCountRes?.value ?? 0;
  if (pinnedCount >= maxPinned) {
    return {
      ok: false,
      error: `You can only pin up to ${maxPinned} post${maxPinned === 1 ? '' : 's'}`,
      code: 400,
    };
  }

  await db
    .update(schema.posts)
    .set({ pinnedAt: new Date().toISOString() })
    .where(eq(schema.posts.id, postId))
    .run();

  return { ok: true };
}

export async function unpinPost(
  db: Db,
  userId: number,
  postId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const post = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .get();

  if (!post || post.deletedAt) {
    return { ok: false, error: 'Post not found', code: 404 };
  }
  if (post.userId !== userId) {
    return { ok: false, error: 'Forbidden', code: 403 };
  }

  await db
    .update(schema.posts)
    .set({ pinnedAt: null })
    .where(eq(schema.posts.id, postId))
    .run();

  return { ok: true };
}
