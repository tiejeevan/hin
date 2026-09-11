import { drizzle } from 'drizzle-orm/d1';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Poll, Post, PostVisibility, RepostedPostRef } from '@hin/types';
import { parseMediaUrls } from './media';
import { loadPollsForPosts } from './polls';
import { isGamificationEnabled } from './gamification/settings';
import { loadEquippedBadgesForUsers } from './gamification/equipped';
import { getHiddenAuthorIds } from './blocks';

type Db = ReturnType<typeof drizzle<typeof schema>>;

function canViewPostWithFollowSet(
  viewerId: number | null,
  post: { userId: number; visibility: string | null | undefined },
  followingAuthorIds: Set<number>,
): boolean {
  const visibility = (post.visibility ?? 'public') as PostVisibility;
  if (viewerId === post.userId) return true;
  if (visibility === 'public') return true;
  if (visibility === 'only_me') return false;
  if (!viewerId) return false;
  return followingAuthorIds.has(post.userId);
}

export type PostHydrationRow = {
  id: number;
  userId: number;
  type?: string | null;
  content: string;
  mediaUrls: string | null;
  visibility?: string | null;
  createdAt: string;
  pinnedAt?: string | null;
  threadRootId?: number | null;
  parentPostId?: number | null;
  linkPreviewId?: number | null;
  repostOfPostId?: number | null;
  isQuote?: number | null;
  username: string;
  authorAvatarUrl?: string | null;
  authorRole?: string;
};

export type BuildPostsOptions = {
  /** When true, skip nested repost embeds and silent-repost filtering (1-level max). */
  isNested?: boolean;
};

function toCountMap(rows: { postId: number; value: number }[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.postId, Number(row.value) || 0);
  }
  return map;
}

const postSelectFields = {
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
  repostOfPostId: schema.posts.repostOfPostId,
  isQuote: schema.posts.isQuote,
  username: schema.users.username,
  authorAvatarUrl: schema.users.avatarUrl,
  authorRole: schema.users.role,
};

/**
 * Batch-hydrates Post response objects for a page of rows.
 * Replaces per-post N+1 queries with grouped / IN lookups.
 */
export async function buildPostsResponseBatch(
  db: Db,
  posts: PostHydrationRow[],
  currentUserId: number | null,
  pollMap?: Map<number, Poll>,
  options?: BuildPostsOptions,
): Promise<Post[]> {
  if (posts.length === 0) return [];

  const isNested = options?.isNested === true;
  const postIds = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.userId))];
  const linkPreviewIds = [
    ...new Set(
      posts
        .map((p) => p.linkPreviewId)
        .filter((id): id is number => id != null),
    ),
  ];

  const likesCountPromise = db
    .select({ postId: schema.likes.postId, value: count() })
    .from(schema.likes)
    .where(and(inArray(schema.likes.postId, postIds), isNull(schema.likes.deletedAt)))
    .groupBy(schema.likes.postId)
    .all();

  const commentsCountPromise = db
    .select({ postId: schema.comments.postId, value: count() })
    .from(schema.comments)
    .where(
      and(
        inArray(schema.comments.postId, postIds),
        sql`${schema.comments.deletedAt} IS NULL`,
      ),
    )
    .groupBy(schema.comments.postId)
    .all();

  const bookmarksCountPromise = db
    .select({ postId: schema.postBookmarks.postId, value: count() })
    .from(schema.postBookmarks)
    .where(
      and(
        inArray(schema.postBookmarks.postId, postIds),
        isNull(schema.postBookmarks.deletedAt),
      ),
    )
    .groupBy(schema.postBookmarks.postId)
    .all();

  const sharesCountPromise = db
    .select({ postId: schema.postShares.postId, value: count() })
    .from(schema.postShares)
    .where(inArray(schema.postShares.postId, postIds))
    .groupBy(schema.postShares.postId)
    .all();

  const repostsCountPromise = db
    .select({
      postId: schema.posts.repostOfPostId,
      value: count(),
    })
    .from(schema.posts)
    .where(
      and(
        inArray(schema.posts.repostOfPostId, postIds),
        eq(schema.posts.isQuote, 0),
        isNull(schema.posts.deletedAt),
      ),
    )
    .groupBy(schema.posts.repostOfPostId)
    .all();

  const hasLikedPromise =
    currentUserId != null
      ? db
          .select({ postId: schema.likes.postId })
          .from(schema.likes)
          .where(
            and(
              inArray(schema.likes.postId, postIds),
              eq(schema.likes.userId, currentUserId),
              isNull(schema.likes.deletedAt),
            ),
          )
          .all()
      : Promise.resolve([] as { postId: number }[]);

  const hasBookmarkedPromise =
    currentUserId != null
      ? db
          .select({ postId: schema.postBookmarks.postId })
          .from(schema.postBookmarks)
          .where(
            and(
              inArray(schema.postBookmarks.postId, postIds),
              eq(schema.postBookmarks.userId, currentUserId),
              isNull(schema.postBookmarks.deletedAt),
            ),
          )
          .all()
      : Promise.resolve([] as { postId: number }[]);

  const hasRepostedPromise =
    currentUserId != null
      ? db
          .select({ postId: schema.posts.repostOfPostId })
          .from(schema.posts)
          .where(
            and(
              inArray(schema.posts.repostOfPostId, postIds),
              eq(schema.posts.userId, currentUserId),
              eq(schema.posts.isQuote, 0),
              isNull(schema.posts.deletedAt),
            ),
          )
          .all()
      : Promise.resolve([] as { postId: number | null }[]);

  const linkPreviewsPromise =
    linkPreviewIds.length > 0
      ? db
          .select()
          .from(schema.linkPreviews)
          .where(inArray(schema.linkPreviews.id, linkPreviewIds))
          .all()
      : Promise.resolve([] as (typeof schema.linkPreviews.$inferSelect)[]);

  const gamificationPromise = isGamificationEnabled(db);

  const [
    likesCountRows,
    commentsCountRows,
    bookmarksCountRows,
    sharesCountRows,
    repostsCountRows,
    hasLikedRows,
    hasBookmarkedRows,
    hasRepostedRows,
    linkPreviewRows,
    gamificationOn,
  ] = await Promise.all([
    likesCountPromise,
    commentsCountPromise,
    bookmarksCountPromise,
    sharesCountPromise,
    repostsCountPromise,
    hasLikedPromise,
    hasBookmarkedPromise,
    hasRepostedPromise,
    linkPreviewsPromise,
    gamificationPromise,
  ]);

  const badgesByUser = gamificationOn
    ? await loadEquippedBadgesForUsers(db, authorIds)
    : new Map();

  const resolvedPollMap =
    pollMap ??
    (await loadPollsForPosts(
      db,
      posts.filter((p) => (p.type ?? 'text') === 'poll').map((p) => p.id),
      new Map(posts.map((p) => [p.id, p.userId])),
      currentUserId,
    ));

  const likesCountByPost = toCountMap(likesCountRows);
  const commentsCountByPost = toCountMap(commentsCountRows);
  const bookmarksCountByPost = toCountMap(bookmarksCountRows);
  const sharesCountByPost = toCountMap(sharesCountRows);

  const repostsCountByPost = new Map<number, number>();
  for (const row of repostsCountRows) {
    if (row.postId != null) {
      repostsCountByPost.set(row.postId, Number(row.value) || 0);
    }
  }

  const likedSet = new Set(hasLikedRows.map((r) => r.postId));
  const bookmarkedSet = new Set(hasBookmarkedRows.map((r) => r.postId));
  const repostedSet = new Set(
    hasRepostedRows
      .map((r) => r.postId)
      .filter((id): id is number => id != null),
  );

  const linkPreviewById = new Map<number, Post['linkPreview']>();
  for (const preview of linkPreviewRows) {
    if (preview.fetchFailed) continue;
    linkPreviewById.set(preview.id, {
      url: preview.url,
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
      siteName: preview.siteName,
    });
  }

  // --- 1-level nested originals (skipped when already nesting) ---
  const embedByOriginalId = new Map<number, RepostedPostRef>();
  if (!isNested) {
    const originalIds = [
      ...new Set(
        posts
          .map((p) => p.repostOfPostId)
          .filter((id): id is number => id != null),
      ),
    ];

    if (originalIds.length > 0) {
      const originalRows = await db
        .select(postSelectFields)
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
        .where(
          and(
            inArray(schema.posts.id, originalIds),
            isNull(schema.posts.deletedAt),
          ),
        )
        .all();

      const hydratedOriginals = await buildPostsResponseBatch(
        db,
        originalRows,
        currentUserId,
        undefined,
        { isNested: true },
      );
      const hydratedById = new Map(hydratedOriginals.map((p) => [p.id, p]));

      const hiddenAuthorIds =
        currentUserId != null
          ? new Set(await getHiddenAuthorIds(db, currentUserId))
          : new Set<number>();

      const originalAuthorIds = [...new Set(originalRows.map((r) => r.userId))];
      const followingAuthorIds = currentUserId != null && originalAuthorIds.length > 0
        ? new Set(
          (await db
            .select({ followingId: schema.userFollows.followingId })
            .from(schema.userFollows)
            .where(
              and(
                eq(schema.userFollows.followerId, currentUserId),
                inArray(schema.userFollows.followingId, originalAuthorIds),
                isNull(schema.userFollows.deletedAt),
              ),
            )
            .all()).map((r) => r.followingId),
        )
        : new Set<number>();

      for (const originalId of originalIds) {
        const row = originalRows.find((r) => r.id === originalId);
        if (!row) {
          embedByOriginalId.set(originalId, { id: originalId, unavailable: true });
          continue;
        }
        if (hiddenAuthorIds.has(row.userId)) {
          embedByOriginalId.set(originalId, { id: originalId, unavailable: true });
          continue;
        }
        const allowed = canViewPostWithFollowSet(currentUserId, {
          userId: row.userId,
          visibility: row.visibility,
        }, followingAuthorIds);
        if (!allowed) {
          embedByOriginalId.set(originalId, { id: originalId, unavailable: true });
          continue;
        }
        const hydrated = hydratedById.get(originalId);
        if (hydrated) {
          embedByOriginalId.set(originalId, hydrated);
        } else {
          embedByOriginalId.set(originalId, { id: originalId, unavailable: true });
        }
      }
    }
  }

  const result: Post[] = [];

  for (const post of posts) {
    const postType = (post.type ?? 'text') as Post['type'];
    const isQuote = (post.isQuote ?? 0) === 1;
    const repostOfPostId = post.repostOfPostId ?? null;

    let repostedPost: RepostedPostRef | null | undefined;
    if (!isNested && repostOfPostId != null) {
      repostedPost =
        embedByOriginalId.get(repostOfPostId) ?? { id: repostOfPostId, unavailable: true };
    }

    // Silent reposts whose original is unavailable are dropped from the feed.
    if (!isNested && repostOfPostId != null && !isQuote) {
      if (
        !repostedPost ||
        ('unavailable' in repostedPost && repostedPost.unavailable)
      ) {
        continue;
      }
    }

    const response: Post = {
      id: post.id,
      userId: post.userId,
      username: post.username,
      authorAvatarUrl: post.authorAvatarUrl,
      authorRole: post.authorRole,
      authorEquippedBadges: badgesByUser.get(post.userId) ?? [],
      type: postType,
      content: post.content,
      mediaUrls: parseMediaUrls(post.mediaUrls),
      createdAt: post.createdAt,
      likesCount: likesCountByPost.get(post.id) ?? 0,
      commentsCount: commentsCountByPost.get(post.id) ?? 0,
      hasLiked: likedSet.has(post.id),
      hasBookmarked: bookmarkedSet.has(post.id),
      bookmarksCount: bookmarksCountByPost.get(post.id) ?? 0,
      sharesCount: sharesCountByPost.get(post.id) ?? 0,
      visibility: (post.visibility ?? 'public') as PostVisibility,
      pinnedAt: post.pinnedAt ?? null,
      threadRootId: post.threadRootId ?? null,
      parentPostId: post.parentPostId ?? null,
      threadReplyCount: 0,
      linkPreview: post.linkPreviewId
        ? (linkPreviewById.get(post.linkPreviewId) ?? null)
        : null,
      repostOfPostId,
      isQuote: repostOfPostId != null ? isQuote : false,
      repostedPost: repostedPost ?? null,
      repostsCount: repostsCountByPost.get(post.id) ?? 0,
      hasReposted: repostedSet.has(post.id),
    };

    if (postType === 'poll') {
      response.poll = resolvedPollMap.get(post.id) ?? undefined;
    }

    result.push(response);
  }

  return result;
}
