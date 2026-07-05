import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, desc, lt } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { BlockListUser, BlockStatus } from '@hin/types';
import type { Env } from '../types';
import { unfollowUser, cancelFollowRequest } from './follows';
import { getMutedUserIds } from './mutes';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const LIST_PAGE_SIZE = 20;

export async function hasBlocked(
  db: Db,
  blockerId: number,
  blockedId: number,
): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.userBlocks)
    .where(
      and(
        eq(schema.userBlocks.blockerId, blockerId),
        eq(schema.userBlocks.blockedId, blockedId),
        isNull(schema.userBlocks.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function isBlocked(
  db: Db,
  userA: number,
  userB: number,
): Promise<boolean> {
  if (userA === userB) return false;
  const [aBlocksB, bBlocksA] = await Promise.all([
    hasBlocked(db, userA, userB),
    hasBlocked(db, userB, userA),
  ]);
  return aBlocksB || bBlocksA;
}

export async function getBlockStatus(
  db: Db,
  viewerId: number | null,
  targetId: number,
): Promise<BlockStatus> {
  if (!viewerId || viewerId === targetId) return 'none';

  const [youBlocked, blockedYou] = await Promise.all([
    hasBlocked(db, viewerId, targetId),
    hasBlocked(db, targetId, viewerId),
  ]);

  if (youBlocked) return 'you_blocked';
  if (blockedYou) return 'blocked_you';
  return 'none';
}

export async function getBlockedUserIds(db: Db, userId: number): Promise<number[]> {
  const rows = await db
    .select({ blockedId: schema.userBlocks.blockedId })
    .from(schema.userBlocks)
    .where(
      and(
        eq(schema.userBlocks.blockerId, userId),
        isNull(schema.userBlocks.deletedAt),
      ),
    )
    .all();
  return rows.map(r => r.blockedId);
}

export async function getHiddenAuthorIds(db: Db, viewerId: number): Promise<number[]> {
  const [blocked, muted] = await Promise.all([
    getBlockedUserIds(db, viewerId),
    getMutedUserIds(db, viewerId),
  ]);
  return [...new Set([...blocked, ...muted])];
}

export async function shouldDeliverNotification(
  db: Db,
  recipientId: number,
  senderId: number,
): Promise<boolean> {
  if (recipientId === senderId) return false;
  const [blocked, muted] = await Promise.all([
    isBlocked(db, recipientId, senderId),
    hasMuted(db, recipientId, senderId),
  ]);
  return !blocked && !muted;
}

async function hasMuted(db: Db, muterId: number, mutedId: number): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.userMutes)
    .where(
      and(
        eq(schema.userMutes.muterId, muterId),
        eq(schema.userMutes.mutedId, mutedId),
        isNull(schema.userMutes.deletedAt),
      ),
    )
    .get();
  return !!row;
}

async function upsertActiveBlock(db: Db, blockerId: number, blockedId: number) {
  const existing = await db
    .select()
    .from(schema.userBlocks)
    .where(
      and(
        eq(schema.userBlocks.blockerId, blockerId),
        eq(schema.userBlocks.blockedId, blockedId),
      ),
    )
    .get();

  if (existing) {
    if (!existing.deletedAt) return;
    await db
      .update(schema.userBlocks)
      .set({ deletedAt: null, createdAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.userBlocks.blockerId, blockerId),
          eq(schema.userBlocks.blockedId, blockedId),
        ),
      )
      .run();
  } else {
    await db.insert(schema.userBlocks).values({ blockerId, blockedId }).run();
  }
}

export async function blockUser(
  db: Db,
  _env: Env,
  blockerId: number,
  blockedId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  if (blockerId === blockedId) {
    return { ok: false, error: 'Cannot block yourself', code: 400 };
  }

  const target = await db
    .select({ id: schema.users.id, deletedAt: schema.users.deletedAt })
    .from(schema.users)
    .where(eq(schema.users.id, blockedId))
    .get();

  if (!target || target.deletedAt) {
    return { ok: false, error: 'User not found', code: 404 };
  }

  await upsertActiveBlock(db, blockerId, blockedId);

  await unfollowUser(db, blockerId, blockedId);
  await unfollowUser(db, blockedId, blockerId);
  await cancelFollowRequest(db, blockerId, blockedId);
  await cancelFollowRequest(db, blockedId, blockerId);

  return { ok: true };
}

export async function unblockUser(
  db: Db,
  blockerId: number,
  blockedId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const existing = await db
    .select()
    .from(schema.userBlocks)
    .where(
      and(
        eq(schema.userBlocks.blockerId, blockerId),
        eq(schema.userBlocks.blockedId, blockedId),
        isNull(schema.userBlocks.deletedAt),
      ),
    )
    .get();

  if (!existing) return { ok: true };

  await db
    .update(schema.userBlocks)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.userBlocks.blockerId, blockerId),
        eq(schema.userBlocks.blockedId, blockedId),
      ),
    )
    .run();

  return { ok: true };
}

export async function listBlockedUsers(
  db: Db,
  userId: number,
  cursor: number | null,
  limit = LIST_PAGE_SIZE,
): Promise<{ users: BlockListUser[]; nextCursor: number | null }> {
  const conditions = [
    eq(schema.userBlocks.blockerId, userId),
    isNull(schema.userBlocks.deletedAt),
    isNull(schema.users.deletedAt),
  ];
  if (cursor !== null) {
    conditions.push(lt(schema.userBlocks.blockedId, cursor));
  }

  const rows = await db
    .select({
      blockedId: schema.userBlocks.blockedId,
      createdAt: schema.userBlocks.createdAt,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.userBlocks.blockedId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userBlocks.blockedId))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].blockedId : null;

  const users: BlockListUser[] = pageRows.map(r => ({
    id: r.blockedId,
    username: r.username,
    avatarUrl: r.avatarUrl ?? null,
    createdAt: r.createdAt,
  }));

  return { users, nextCursor };
}

export async function isAuthorHiddenFromViewer(
  db: Db,
  viewerId: number | null,
  authorId: number,
): Promise<boolean> {
  if (!viewerId || viewerId === authorId) return false;
  const hiddenIds = await getHiddenAuthorIds(db, viewerId);
  return hiddenIds.includes(authorId);
}
