import { drizzle } from 'drizzle-orm/d1';
import { eq, and, or, sql, SQL } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { PostVisibility } from '@hin/types';
import { isFollowing } from './follows';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function canViewPost(
  db: Db,
  viewerId: number | null,
  post: { userId: number; visibility: string | null | undefined },
): Promise<boolean> {
  const visibility = (post.visibility ?? 'public') as PostVisibility;
  if (viewerId === post.userId) return true;
  if (visibility === 'public') return true;
  if (visibility === 'only_me') return false;
  if (!viewerId) return false;
  return isFollowing(db, viewerId, post.userId);
}

function followerExistsSql(viewerId: number): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${schema.userFollows}
    WHERE ${schema.userFollows.followerId} = ${viewerId}
      AND ${schema.userFollows.followingId} = ${schema.posts.userId}
      AND ${schema.userFollows.deletedAt} IS NULL
  )`;
}

export function buildVisibilitySqlConditions(
  viewerId: number | null,
  mode: 'everyone' | 'following' | 'profile',
  profileUserId?: number,
): SQL | undefined {
  if (mode === 'everyone') {
    if (viewerId) {
      return or(
        eq(schema.posts.visibility, 'public'),
        eq(schema.posts.userId, viewerId),
      )!;
    }
    return eq(schema.posts.visibility, 'public');
  }

  if (mode === 'following') {
    if (viewerId) {
      return or(
        eq(schema.posts.visibility, 'public'),
        eq(schema.posts.visibility, 'followers'),
        eq(schema.posts.userId, viewerId),
      )!;
    }
    return eq(schema.posts.visibility, 'public');
  }

  // profile
  if (!profileUserId) return undefined;
  if (viewerId === profileUserId) return undefined;

  if (viewerId) {
    return or(
      eq(schema.posts.visibility, 'public'),
      and(
        eq(schema.posts.visibility, 'followers'),
        followerExistsSql(viewerId),
      )!,
    )!;
  }
  return eq(schema.posts.visibility, 'public');
}

export async function assertCanViewPost(
  db: Db,
  viewerId: number | null,
  postId: number,
): Promise<
  | { ok: true; post: typeof schema.posts.$inferSelect }
  | { ok: false; status: 404 | 403; error: string }
> {
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post || post.deletedAt) {
    return { ok: false, status: 404, error: 'Post not found' };
  }
  const allowed = await canViewPost(db, viewerId, { userId: post.userId, visibility: post.visibility });
  if (!allowed) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, post };
}
