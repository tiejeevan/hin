import { eq, and, or, sql, desc, asc, like, isNull, notInArray, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { User, Post, TrendingHashtag, FollowStatus } from '@hin/types';
import { USER_PUBLIC_FIELDS, toPublicUser } from './users';
import { getHiddenAuthorIds } from './blocks';
import { buildVisibilitySqlConditions } from './postVisibility';
import { loadPollsForPosts } from './polls';
import { loadEquippedBadgesForUsers } from './gamification/equipped';
import { isGamificationEnabled } from './gamification/settings';
import { buildPostResponse } from '../routes/posts';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Searches users matching username or bio.
 * Prioritizes followed users and interacted users.
 */
export async function searchUsers(
  db: Db,
  q: string,
  viewerId: number | null,
  limit: number,
  offset: number,
): Promise<User[]> {
  const queryPattern = `%${q}%`;

  // Base conditions: not soft-deleted
  const conditions = [isNull(schema.users.deletedAt)];

  // Match username or bio
  conditions.push(
    or(
      like(schema.users.username, queryPattern),
      like(schema.users.bio, queryPattern),
    )!,
  );

  const matchingUsers = await db
    .select(USER_PUBLIC_FIELDS)
    .from(schema.users)
    .where(and(...conditions))
    .all();

  if (matchingUsers.length === 0) return [];

  // Sort and Paginate in memory to easily leverage follow/interaction stats
  let followedSet = new Set<number>();
  let interactedSet = new Set<number>();

  if (viewerId) {
    // Fetch followed user IDs to prioritize them
    const followed = await db
      .select({ followingId: schema.userFollows.followingId })
      .from(schema.userFollows)
      .where(
        and(
          eq(schema.userFollows.followerId, viewerId),
          isNull(schema.userFollows.deletedAt),
        ),
      )
      .all();
    followedSet = new Set(followed.map(f => f.followingId));

    // Fetch interacted users from messages
    const interactions = await db
      .select({
        senderId: schema.messages.senderId,
        receiverId: schema.messages.receiverId,
      })
      .from(schema.messages)
      .where(
        and(
          or(
            eq(schema.messages.senderId, viewerId),
            eq(schema.messages.receiverId, viewerId),
          ),
          isNull(schema.messages.deletedAt),
        ),
      )
      .all();

    for (const m of interactions) {
      if (m.senderId !== viewerId) interactedSet.add(m.senderId);
      if (m.receiverId !== viewerId) interactedSet.add(m.receiverId);
    }
  }

  // Load equipped badges
  const isGamEnabled = await isGamificationEnabled(db);
  const equippedBadgesByUser = isGamEnabled
    ? await loadEquippedBadgesForUsers(db, matchingUsers.map(u => u.id))
    : new Map();

  const userIds = matchingUsers.map(u => u.id);

  // Load follower/following statuses for all results if viewer is logged in
  const followStatuses = new Map<number, FollowStatus>();
  if (viewerId && userIds.length > 0) {
    const [followedByRows, requestedRows] = await Promise.all([
      db
        .select({ followerId: schema.userFollows.followerId })
        .from(schema.userFollows)
        .where(
          and(
            eq(schema.userFollows.followingId, viewerId),
            inArray(schema.userFollows.followerId, userIds),
            isNull(schema.userFollows.deletedAt),
          ),
        )
        .all(),
      db
        .select({ targetId: schema.followRequests.targetId })
        .from(schema.followRequests)
        .where(
          and(
            eq(schema.followRequests.requesterId, viewerId),
            inArray(schema.followRequests.targetId, userIds),
            isNull(schema.followRequests.deletedAt),
          ),
        )
        .all(),
    ]);

    const followedBySet = new Set(followedByRows.map(r => r.followerId));
    const requestedSet = new Set(requestedRows.map(r => r.targetId));

    for (const id of userIds) {
      if (id === viewerId) {
        followStatuses.set(id, 'none');
      } else if (followedSet.has(id)) {
        followStatuses.set(id, 'following');
      } else if (requestedSet.has(id)) {
        followStatuses.set(id, 'requested');
      } else if (followedBySet.has(id)) {
        followStatuses.set(id, 'follows_you');
      } else {
        followStatuses.set(id, 'none');
      }
    }
  }

  const mapped = matchingUsers.map(u => {
    const publicUser = toPublicUser(u, {
      equippedBadges: equippedBadgesByUser.get(u.id) ?? [],
      followStatus: followStatuses.get(u.id) ?? 'none',
    });
    return {
      user: publicUser,
      isFollowing: followedSet.has(u.id),
      hasInteracted: interactedSet.has(u.id),
    };
  });

  // Sort: Followed first, then Interacted, then alphabetical username
  mapped.sort((a, b) => {
    if (a.isFollowing && !b.isFollowing) return -1;
    if (!a.isFollowing && b.isFollowing) return 1;
    if (a.hasInteracted && !b.hasInteracted) return -1;
    if (!a.hasInteracted && b.hasInteracted) return 1;
    return a.user.username.localeCompare(b.user.username);
  });

  // Apply pagination offset & limit
  const paginated = mapped.slice(offset, offset + limit);
  return paginated.map(m => m.user);
}

/**
 * Searches posts matching content query.
 * Obeys visibility rules and respects user blocks.
 */
export async function searchPosts(
  db: Db,
  q: string,
  viewerId: number | null,
  limit: number,
  offset: number,
): Promise<Post[]> {
  const queryPattern = `%${q}%`;

  const postConditions = [
    isNull(schema.posts.deletedAt),
    like(schema.posts.content, queryPattern),
  ];

  // Visibility conditions
  const visibilityCond = buildVisibilitySqlConditions(viewerId, 'everyone');
  if (visibilityCond) postConditions.push(visibilityCond);

  // Block relationship filtering
  if (viewerId) {
    const hiddenIds = await getHiddenAuthorIds(db, viewerId);
    if (hiddenIds.length > 0) {
      postConditions.push(notInArray(schema.posts.userId, hiddenIds));
    }
  }

  const rows = await db
    .select({
      id: schema.posts.id,
      userId: schema.posts.userId,
      type: schema.posts.type,
      content: schema.posts.content,
      mediaUrls: schema.posts.mediaUrls,
      visibility: schema.posts.visibility,
      createdAt: schema.posts.createdAt,
      pinnedAt: schema.posts.pinnedAt,
      threadRootId: schema.posts.threadRootId,
      parentPostId: schema.posts.parentPostId,
      linkPreviewId: schema.posts.linkPreviewId,
      username: schema.users.username,
      authorAvatarUrl: schema.users.avatarUrl,
      authorRole: schema.users.role,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(and(...postConditions))
    .orderBy(desc(schema.posts.id))
    .limit(limit)
    .offset(offset)
    .all();

  if (rows.length === 0) return [];

  // Load polls
  const pollPostIds = rows.filter(r => r.type === 'poll').map(r => r.id);
  const postAuthorMap = new Map(rows.map(r => [r.id, r.userId]));
  const pollMap = await loadPollsForPosts(db, pollPostIds, postAuthorMap, viewerId);

  return Promise.all(
    rows.map(post => buildPostResponse(db, post, viewerId, pollMap)),
  );
}

/**
 * Searches hashtags matching tag query.
 * Returns tag string and count of associated posts.
 */
export async function searchHashtags(
  db: Db,
  q: string,
  limit: number,
  offset: number,
): Promise<TrendingHashtag[]> {
  // Normalize: remove leading '#' and to lowercase
  const cleanQ = q.replace(/^#/, '').toLowerCase();
  const queryPattern = `%${cleanQ}%`;

  const rows = await db
    .select({
      tag: schema.hashtags.tag,
      count: sql<number>`count(${schema.postHashtags.id})`.as('count'),
    })
    .from(schema.hashtags)
    .leftJoin(schema.postHashtags, eq(schema.hashtags.id, schema.postHashtags.hashtagId))
    .leftJoin(schema.posts, eq(schema.postHashtags.postId, schema.posts.id))
    .where(
      and(
        like(schema.hashtags.tag, queryPattern),
        // Only count active, non-deleted posts in the count
        or(isNull(schema.posts.id), isNull(schema.posts.deletedAt))!,
      ),
    )
    .groupBy(schema.hashtags.id)
    .orderBy(sql`count(${schema.postHashtags.id}) DESC`, asc(schema.hashtags.tag))
    .limit(limit)
    .offset(offset)
    .all();

  return rows.map(r => ({
    tag: r.tag,
    count: Number(r.count),
  }));
}

/**
 * Searches posts explicitly mentioning @username.
 * Obeys visibility rules and respects user blocks.
 */
export async function searchMentions(
  db: Db,
  q: string,
  viewerId: number | null,
  limit: number,
  offset: number,
): Promise<Post[]> {
  // Normalize: ensure it starts with '@' and remove extra symbols
  const cleanQ = q.replace(/^@/, '');
  const queryPattern = `%@${cleanQ}%`;

  const postConditions = [
    isNull(schema.posts.deletedAt),
    like(schema.posts.content, queryPattern),
  ];

  // Visibility conditions
  const visibilityCond = buildVisibilitySqlConditions(viewerId, 'everyone');
  if (visibilityCond) postConditions.push(visibilityCond);

  // Block relationship filtering
  if (viewerId) {
    const hiddenIds = await getHiddenAuthorIds(db, viewerId);
    if (hiddenIds.length > 0) {
      postConditions.push(notInArray(schema.posts.userId, hiddenIds));
    }
  }

  const rows = await db
    .select({
      id: schema.posts.id,
      userId: schema.posts.userId,
      type: schema.posts.type,
      content: schema.posts.content,
      mediaUrls: schema.posts.mediaUrls,
      visibility: schema.posts.visibility,
      createdAt: schema.posts.createdAt,
      pinnedAt: schema.posts.pinnedAt,
      threadRootId: schema.posts.threadRootId,
      parentPostId: schema.posts.parentPostId,
      linkPreviewId: schema.posts.linkPreviewId,
      username: schema.users.username,
      authorAvatarUrl: schema.users.avatarUrl,
      authorRole: schema.users.role,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(and(...postConditions))
    .orderBy(desc(schema.posts.id))
    .limit(limit)
    .offset(offset)
    .all();

  if (rows.length === 0) return [];

  // Load polls
  const pollPostIds = rows.filter(r => r.type === 'poll').map(r => r.id);
  const postAuthorMap = new Map(rows.map(r => [r.id, r.userId]));
  const pollMap = await loadPollsForPosts(db, pollPostIds, postAuthorMap, viewerId);

  return Promise.all(
    rows.map(post => buildPostResponse(db, post, viewerId, pollMap)),
  );
}
