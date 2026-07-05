import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, isNull, inArray, desc, lt } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { FollowListUser, FollowRequest, FollowStatus, Notification } from '@hin/types';
import type { Env } from '../types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function isFollowing(db: Db, followerId: number, followingId: number): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        eq(schema.userFollows.followingId, followingId),
        isNull(schema.userFollows.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function hasPendingRequest(db: Db, requesterId: number, targetId: number): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.followRequests)
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
        isNull(schema.followRequests.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function getFollowStatus(
  db: Db,
  viewerId: number | null,
  targetId: number,
): Promise<FollowStatus> {
  if (!viewerId || viewerId === targetId) return 'none';

  const [following, followedBy, requested] = await Promise.all([
    isFollowing(db, viewerId, targetId),
    isFollowing(db, targetId, viewerId),
    hasPendingRequest(db, viewerId, targetId),
  ]);

  if (following) return 'following';
  if (requested) return 'requested';
  if (followedBy) return 'follows_you';
  return 'none';
}

export async function canViewUserPosts(
  db: Db,
  viewerId: number | null,
  target: { id: number; isPrivate: number | boolean },
): Promise<boolean> {
  if (!target.isPrivate || target.isPrivate === 0) return true;
  if (!viewerId) return false;
  if (viewerId === target.id) return true;
  return isFollowing(db, viewerId, target.id);
}

export async function getFollowerCount(db: Db, userId: number): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followingId, userId),
        isNull(schema.userFollows.deletedAt),
      ),
    )
    .get();
  return res?.value || 0;
}

export async function getFollowingCount(db: Db, userId: number): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, userId),
        isNull(schema.userFollows.deletedAt),
      ),
    )
    .get();
  return res?.value || 0;
}

export async function getFollowedUserIds(db: Db, followerId: number): Promise<number[]> {
  const rows = await db
    .select({ followingId: schema.userFollows.followingId })
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        isNull(schema.userFollows.deletedAt),
      ),
    )
    .all();
  return rows.map(r => r.followingId);
}

async function getUserOrThrow(db: Db, userId: number) {
  const user = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      isPrivate: schema.users.isPrivate,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user || user.deletedAt) return null;
  return user;
}

async function broadcastFollowNotification(env: Env, recipientId: number, notification: Notification) {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, notification }),
    }));
  } catch (_e) {}
}

async function broadcastFollowEvent(env: Env, recipientId: number, event: object) {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-user-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, ...event }),
    }));
  } catch (_e) {}
}

async function createFollowNotification(
  db: Db,
  env: Env,
  opts: {
    recipientId: number;
    senderId: number;
    senderUsername: string;
    type: 'follow' | 'follow_request' | 'follow_accepted';
    entityId: number;
    content: string;
  },
) {
  const [notif] = await db.insert(schema.notifications).values({
    userId: opts.recipientId,
    senderId: opts.senderId,
    type: opts.type,
    entityType: 'user',
    entityId: opts.entityId,
    content: opts.content,
    read: 0,
  }).returning();

  const payload: Notification = {
    id: notif.id,
    userId: opts.recipientId,
    senderId: opts.senderId,
    senderUsername: opts.senderUsername,
    type: opts.type,
    entityType: 'user',
    entityId: opts.entityId,
    commentId: null,
    content: opts.content,
    read: false,
    createdAt: notif.createdAt,
  };

  await broadcastFollowNotification(env, opts.recipientId, payload);
}

async function upsertActiveFollow(db: Db, followerId: number, followingId: number) {
  const existing = await db
    .select()
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        eq(schema.userFollows.followingId, followingId),
      ),
    )
    .get();

  if (existing) {
    if (!existing.deletedAt) return;
    await db
      .update(schema.userFollows)
      .set({ deletedAt: null })
      .where(
        and(
          eq(schema.userFollows.followerId, followerId),
          eq(schema.userFollows.followingId, followingId),
        ),
      )
      .run();
  } else {
    await db.insert(schema.userFollows).values({ followerId, followingId }).run();
  }
}

async function upsertPendingRequest(db: Db, requesterId: number, targetId: number) {
  const existing = await db
    .select()
    .from(schema.followRequests)
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
      ),
    )
    .get();

  if (existing) {
    if (!existing.deletedAt) return;
    await db
      .update(schema.followRequests)
      .set({ deletedAt: null, createdAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.followRequests.requesterId, requesterId),
          eq(schema.followRequests.targetId, targetId),
        ),
      )
      .run();
  } else {
    await db.insert(schema.followRequests).values({ requesterId, targetId }).run();
  }
}

export type FollowActionResult =
  | { status: 'following' }
  | { status: 'requested' };

export async function followUser(
  db: Db,
  env: Env,
  followerId: number,
  targetId: number,
  followerUsername: string,
): Promise<{ ok: true; result: FollowActionResult } | { ok: false; error: string; code: number }> {
  if (followerId === targetId) {
    return { ok: false, error: 'Cannot follow yourself', code: 400 };
  }

  const target = await getUserOrThrow(db, targetId);
  if (!target) return { ok: false, error: 'User not found', code: 404 };

  if (await isFollowing(db, followerId, targetId)) {
    return { ok: true, result: { status: 'following' } };
  }

  if (target.isPrivate) {
    if (await hasPendingRequest(db, followerId, targetId)) {
      return { ok: true, result: { status: 'requested' } };
    }
    await upsertPendingRequest(db, followerId, targetId);
    const requester = await db
      .select({
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(eq(schema.users.id, followerId))
      .get();
    await createFollowNotification(db, env, {
      recipientId: targetId,
      senderId: followerId,
      senderUsername: followerUsername,
      type: 'follow_request',
      entityId: followerId,
      content: `@${followerUsername} requested to follow you.`,
    });
    await broadcastFollowEvent(env, targetId, {
      type: 'follow_request_received',
      payload: {
        request: {
          requesterId: followerId,
          requesterUsername: followerUsername,
          requesterAvatarUrl: requester?.avatarUrl ?? null,
          createdAt: new Date().toISOString(),
        },
      },
    });
    return { ok: true, result: { status: 'requested' } };
  }

  await upsertActiveFollow(db, followerId, targetId);
  await createFollowNotification(db, env, {
    recipientId: targetId,
    senderId: followerId,
    senderUsername: followerUsername,
    type: 'follow',
    entityId: followerId,
    content: `@${followerUsername} started following you.`,
  });
  return { ok: true, result: { status: 'following' } };
}

export async function unfollowUser(
  db: Db,
  followerId: number,
  targetId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  if (followerId === targetId) {
    return { ok: false, error: 'Invalid operation', code: 400 };
  }

  const existing = await db
    .select()
    .from(schema.userFollows)
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        eq(schema.userFollows.followingId, targetId),
        isNull(schema.userFollows.deletedAt),
      ),
    )
    .get();

  if (!existing) return { ok: true };

  await db
    .update(schema.userFollows)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.userFollows.followerId, followerId),
        eq(schema.userFollows.followingId, targetId),
      ),
    )
    .run();

  return { ok: true };
}

export async function cancelFollowRequest(
  db: Db,
  requesterId: number,
  targetId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const existing = await db
    .select()
    .from(schema.followRequests)
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
        isNull(schema.followRequests.deletedAt),
      ),
    )
    .get();

  if (!existing) return { ok: true };

  await db
    .update(schema.followRequests)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
      ),
    )
    .run();

  return { ok: true };
}

export async function approveFollowRequest(
  db: Db,
  env: Env,
  targetId: number,
  requesterId: number,
  targetUsername: string,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const request = await db
    .select()
    .from(schema.followRequests)
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
        isNull(schema.followRequests.deletedAt),
      ),
    )
    .get();

  if (!request) return { ok: false, error: 'Follow request not found', code: 404 };

  await db
    .update(schema.followRequests)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
      ),
    )
    .run();

  await upsertActiveFollow(db, requesterId, targetId);

  const requester = await getUserOrThrow(db, requesterId);
  if (requester) {
    await createFollowNotification(db, env, {
      recipientId: requesterId,
      senderId: targetId,
      senderUsername: targetUsername,
      type: 'follow_accepted',
      entityId: targetId,
      content: `@${targetUsername} accepted your follow request.`,
    });
    await broadcastFollowEvent(env, requesterId, {
      type: 'follow_approved',
      payload: {
        targetUserId: targetId,
        targetUsername,
      },
    });
  }

  return { ok: true };
}

export async function rejectFollowRequest(
  db: Db,
  targetId: number,
  requesterId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const request = await db
    .select()
    .from(schema.followRequests)
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
        isNull(schema.followRequests.deletedAt),
      ),
    )
    .get();

  if (!request) return { ok: false, error: 'Follow request not found', code: 404 };

  await db
    .update(schema.followRequests)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.followRequests.requesterId, requesterId),
        eq(schema.followRequests.targetId, targetId),
      ),
    )
    .run();

  return { ok: true };
}

export async function listPendingRequests(db: Db, targetId: number): Promise<FollowRequest[]> {
  const rows = await db
    .select({
      requesterId: schema.followRequests.requesterId,
      createdAt: schema.followRequests.createdAt,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.followRequests)
    .innerJoin(schema.users, eq(schema.followRequests.requesterId, schema.users.id))
    .where(
      and(
        eq(schema.followRequests.targetId, targetId),
        isNull(schema.followRequests.deletedAt),
        isNull(schema.users.deletedAt),
      ),
    )
    .orderBy(desc(schema.followRequests.createdAt))
    .all();

  return rows.map(r => ({
    requesterId: r.requesterId,
    requesterUsername: r.username,
    requesterAvatarUrl: r.avatarUrl ?? null,
    createdAt: r.createdAt,
  }));
}

const LIST_PAGE_SIZE = 20;

async function enrichFollowListUsers(
  db: Db,
  userIds: number[],
): Promise<Map<number, { username: string; avatarUrl: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.users)
    .where(
      and(
        inArray(schema.users.id, userIds),
        isNull(schema.users.deletedAt),
      ),
    )
    .all();
  return new Map(rows.map(r => [r.id, { username: r.username, avatarUrl: r.avatarUrl ?? null }]));
}

export async function listFollowers(
  db: Db,
  viewerId: number | null,
  userId: number,
  cursor: number | null,
  limit = LIST_PAGE_SIZE,
): Promise<{ users: FollowListUser[]; nextCursor: number | null }> {
  const conditions = [
    eq(schema.userFollows.followingId, userId),
    isNull(schema.userFollows.deletedAt),
    isNull(schema.users.deletedAt),
  ];
  if (cursor !== null) {
    conditions.push(lt(schema.userFollows.followerId, cursor));
  }

  const rows = await db
    .select({
      followerId: schema.userFollows.followerId,
    })
    .from(schema.userFollows)
    .innerJoin(schema.users, eq(schema.userFollows.followerId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userFollows.followerId))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].followerId : null;

  const ids = pageRows.map(r => r.followerId);
  const infoMap = await enrichFollowListUsers(db, ids);
  const statuses = viewerId
    ? await Promise.all(ids.map(id => getFollowStatus(db, viewerId, id)))
    : ids.map(() => 'none' as FollowStatus);

  const users: FollowListUser[] = pageRows.map((r, i) => ({
    id: r.followerId,
    username: infoMap.get(r.followerId)?.username || 'unknown',
    avatarUrl: infoMap.get(r.followerId)?.avatarUrl ?? null,
    followStatus: statuses[i],
  }));

  return { users, nextCursor };
}

export async function listFollowing(
  db: Db,
  viewerId: number | null,
  userId: number,
  cursor: number | null,
  limit = LIST_PAGE_SIZE,
): Promise<{ users: FollowListUser[]; nextCursor: number | null }> {
  const conditions = [
    eq(schema.userFollows.followerId, userId),
    isNull(schema.userFollows.deletedAt),
    isNull(schema.users.deletedAt),
  ];
  if (cursor !== null) {
    conditions.push(lt(schema.userFollows.followingId, cursor));
  }

  const rows = await db
    .select({
      followingId: schema.userFollows.followingId,
    })
    .from(schema.userFollows)
    .innerJoin(schema.users, eq(schema.userFollows.followingId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userFollows.followingId))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].followingId : null;

  const ids = pageRows.map(r => r.followingId);
  const infoMap = await enrichFollowListUsers(db, ids);
  const statuses = viewerId
    ? await Promise.all(ids.map(id => getFollowStatus(db, viewerId, id)))
    : ids.map(() => 'none' as FollowStatus);

  const users: FollowListUser[] = pageRows.map((r, i) => ({
    id: r.followingId,
    username: infoMap.get(r.followingId)?.username || 'unknown',
    avatarUrl: infoMap.get(r.followingId)?.avatarUrl ?? null,
    followStatus: statuses[i],
  }));

  return { users, nextCursor };
}

/** IDs of users whose posts should appear in the viewer's Following feed (followed users only). */
export async function getFollowingFeedUserIds(db: Db, viewerId: number): Promise<number[]> {
  return getFollowedUserIds(db, viewerId);
}
