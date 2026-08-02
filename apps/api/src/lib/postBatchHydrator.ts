import { drizzle } from 'drizzle-orm/d1';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Poll, Post, PostVisibility } from '@hin/types';
import { parseMediaUrls } from './media';
import { loadPollsForPosts } from './polls';
import { isGamificationEnabled } from './gamification/settings';
import { loadEquippedBadgesForUsers } from './gamification/equipped';

type Db = ReturnType<typeof drizzle<typeof schema>>;

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
  username: string;
  authorAvatarUrl?: string | null;
  authorRole?: string;
};

function toCountMap(rows: { postId: number; value: number }[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.postId, Number(row.value) || 0);
  }
  return map;
}

/**
 * Batch-hydrates Post response objects for a page of rows.
 * Replaces per-post N+1 queries with grouped / IN lookups.
 */
export async function buildPostsResponseBatch(
  db: Db,
  posts: PostHydrationRow[],
  currentUserId: number | null,
  pollMap?: Map<number, Poll>,
): Promise<Post[]> {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.userId))];
  const linkPreviewIds = [
    ...new Set(
      posts
        .map((p) => p.linkPreviewId)
        .filter((id): id is number => id != null),
    ),
  ];
  const effectiveRootIds = [...new Set(posts.map((p) => p.threadRootId ?? p.id))];

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

  const threadReplyCountPromise = db
    .select({
      rootId: schema.posts.threadRootId,
      value: count(),
    })
    .from(schema.posts)
    .where(
      and(
        inArray(schema.posts.threadRootId, effectiveRootIds),
        isNull(schema.posts.deletedAt),
      ),
    )
    .groupBy(schema.posts.threadRootId)
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
    threadReplyCountRows,
    hasLikedRows,
    hasBookmarkedRows,
    linkPreviewRows,
    gamificationOn,
  ] = await Promise.all([
    likesCountPromise,
    commentsCountPromise,
    bookmarksCountPromise,
    sharesCountPromise,
    threadReplyCountPromise,
    hasLikedPromise,
    hasBookmarkedPromise,
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

  const threadReplyCountByRoot = new Map<number, number>();
  for (const row of threadReplyCountRows) {
    if (row.rootId != null) {
      threadReplyCountByRoot.set(row.rootId, Number(row.value) || 0);
    }
  }

  const likedSet = new Set(hasLikedRows.map((r) => r.postId));
  const bookmarkedSet = new Set(hasBookmarkedRows.map((r) => r.postId));

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

  return posts.map((post) => {
    const postType = (post.type ?? 'text') as Post['type'];
    const effectiveRootId = post.threadRootId ?? post.id;
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
      threadReplyCount: threadReplyCountByRoot.get(effectiveRootId) ?? 0,
      linkPreview: post.linkPreviewId
        ? (linkPreviewById.get(post.linkPreviewId) ?? null)
        : null,
    };

    if (postType === 'poll') {
      response.poll = resolvedPollMap.get(post.id) ?? undefined;
    }

    return response;
  });
}
