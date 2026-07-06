import { drizzle } from 'drizzle-orm/d1';
import { eq, or, and, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import bcrypt from 'bcryptjs';
import type { AccountStatus, DeletionSource } from '@hin/types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export function computeAccountStatus(
  deletedAt: string | null | undefined,
  deletionSource: string | null | undefined,
): AccountStatus {
  if (!deletedAt) return 'active';
  if (deletionSource === 'self') return 'self_deleted';
  return 'admin_deleted';
}

export async function verifyPassword(
  db: Db,
  userId: number,
  password: string,
): Promise<boolean> {
  const user = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user?.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function softDeleteUser(
  db: Db,
  userId: number,
  source: DeletionSource,
): Promise<{ ok: true; batchAt: string } | { ok: false; error: string; code: number }> {
  const user = await db
    .select({
      id: schema.users.id,
      deletedAt: schema.users.deletedAt,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) return { ok: false, error: 'User not found', code: 404 };
  if (user.deletedAt) return { ok: false, error: 'User already deleted', code: 400 };

  const batchAt = new Date().toISOString();

  await db
    .update(schema.users)
    .set({ deletedAt: batchAt, deletionSource: source })
    .where(eq(schema.users.id, userId))
    .run();

  await db
    .update(schema.posts)
    .set({ deletedAt: batchAt, pinnedAt: null })
    .where(and(eq(schema.posts.userId, userId), isNull(schema.posts.deletedAt)))
    .run();

  await db
    .update(schema.comments)
    .set({ deletedAt: batchAt })
    .where(and(eq(schema.comments.userId, userId), isNull(schema.comments.deletedAt)))
    .run();

  await db
    .update(schema.likes)
    .set({ deletedAt: batchAt })
    .where(and(eq(schema.likes.userId, userId), isNull(schema.likes.deletedAt)))
    .run();

  await db
    .update(schema.commentLikes)
    .set({ deletedAt: batchAt })
    .where(and(eq(schema.commentLikes.userId, userId), isNull(schema.commentLikes.deletedAt)))
    .run();

  await db
    .update(schema.postBookmarks)
    .set({ deletedAt: batchAt })
    .where(and(eq(schema.postBookmarks.userId, userId), isNull(schema.postBookmarks.deletedAt)))
    .run();

  await db
    .update(schema.userFollows)
    .set({ deletedAt: batchAt })
    .where(
      and(
        or(
          eq(schema.userFollows.followerId, userId),
          eq(schema.userFollows.followingId, userId),
        ),
        isNull(schema.userFollows.deletedAt),
      ),
    )
    .run();

  await db
    .update(schema.followRequests)
    .set({ deletedAt: batchAt })
    .where(
      and(
        or(
          eq(schema.followRequests.requesterId, userId),
          eq(schema.followRequests.targetId, userId),
        ),
        isNull(schema.followRequests.deletedAt),
      ),
    )
    .run();

  await db
    .update(schema.userBlocks)
    .set({ deletedAt: batchAt })
    .where(
      and(
        or(
          eq(schema.userBlocks.blockerId, userId),
          eq(schema.userBlocks.blockedId, userId),
        ),
        isNull(schema.userBlocks.deletedAt),
      ),
    )
    .run();

  await db
    .update(schema.userMutes)
    .set({ deletedAt: batchAt })
    .where(
      and(
        or(
          eq(schema.userMutes.muterId, userId),
          eq(schema.userMutes.mutedId, userId),
        ),
        isNull(schema.userMutes.deletedAt),
      ),
    )
    .run();

  await db
    .update(schema.messages)
    .set({ deletedAt: batchAt })
    .where(and(eq(schema.messages.senderId, userId), isNull(schema.messages.deletedAt)))
    .run();

  return { ok: true, batchAt };
}

export async function reinstateUser(
  db: Db,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const user = await db
    .select({
      id: schema.users.id,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user) return { ok: false, error: 'User not found', code: 404 };
  if (!user.deletedAt) return { ok: false, error: 'User is not deleted', code: 400 };

  const batchAt = user.deletedAt;

  await db
    .update(schema.users)
    .set({ deletedAt: null, deletionSource: null })
    .where(eq(schema.users.id, userId))
    .run();

  const restoreWhere = (table: { userId: typeof schema.posts.userId; deletedAt: typeof schema.posts.deletedAt }) =>
    and(eq(table.userId, userId), eq(table.deletedAt, batchAt));

  await db
    .update(schema.posts)
    .set({ deletedAt: null })
    .where(restoreWhere(schema.posts))
    .run();

  await db
    .update(schema.comments)
    .set({ deletedAt: null })
    .where(restoreWhere(schema.comments))
    .run();

  await db
    .update(schema.likes)
    .set({ deletedAt: null })
    .where(restoreWhere(schema.likes))
    .run();

  await db
    .update(schema.commentLikes)
    .set({ deletedAt: null })
    .where(restoreWhere(schema.commentLikes))
    .run();

  await db
    .update(schema.postBookmarks)
    .set({ deletedAt: null })
    .where(restoreWhere(schema.postBookmarks))
    .run();

  await db
    .update(schema.messages)
    .set({ deletedAt: null })
    .where(
      and(eq(schema.messages.senderId, userId), eq(schema.messages.deletedAt, batchAt)),
    )
    .run();

  // Restore follow/block/mute rows where this user was involved and deleted in the batch
  const pairRestore = (
    table: typeof schema.userFollows,
    colA: typeof schema.userFollows.followerId,
    colB: typeof schema.userFollows.followingId,
  ) =>
    db
      .update(table)
      .set({ deletedAt: null })
      .where(
        and(
          or(eq(colA, userId), eq(colB, userId)),
          eq(table.deletedAt, batchAt),
        ),
      )
      .run();

  await pairRestore(schema.userFollows, schema.userFollows.followerId, schema.userFollows.followingId);
  await pairRestore(schema.followRequests, schema.followRequests.requesterId, schema.followRequests.targetId);
  await pairRestore(schema.userBlocks, schema.userBlocks.blockerId, schema.userBlocks.blockedId);
  await pairRestore(schema.userMutes, schema.userMutes.muterId, schema.userMutes.mutedId);

  return { ok: true };
}
