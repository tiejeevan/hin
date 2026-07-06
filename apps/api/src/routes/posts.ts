import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, count, sql, isNull, lt, inArray, notInArray, asc } from 'drizzle-orm';
import * as schema from '@hin/db';
import { Post, Comment, Notification, PostsPage, PostThreadPage, parseCreatePostBody, VotePollSchema, validatePostLimits } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { linkPostMedia, parseMediaUrls, serializeMediaUrls, validateOwnedPostMedia } from '../lib/media';
import { notifyMentions } from '../lib/mentions';
import { syncPostHashtags } from '../lib/hashtags';
import { parseFirstUrl, getOrFetchLinkPreview } from '../lib/linkPreview';
import { createPollWithOptions, loadPollsForPosts, castVote, retractVote, closePoll, getPollByPostId } from '../lib/polls';
import { getFollowingFeedUserIds } from '../lib/follows';
import { getHiddenAuthorIds, shouldDeliverNotification } from '../lib/blocks';
import { buildVisibilitySqlConditions, assertCanViewPost } from '../lib/postVisibility';
import { getOrCreateUserSettings, isNotificationEnabled } from '../lib/user-settings';
import { pinPost, unpinPost } from '../lib/post-pins';
import { getSystemSettings } from '../lib/system-settings';
import { validateThreadReply, countThreadReplies, assertCanViewThread, getThreadPostRows } from '../lib/post-threads';
import type { PostVisibility } from '@hin/types';

const posts = new Hono<{ Bindings: Env }>();

const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 50;

async function broadcastEvent(env: Env, message: object) {
  try {
    const doId = env.REALTIME_DO.idFromName('global');
    const doStub = env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    }));
  } catch (_e) {}
}

async function buildPostResponse(
  db: ReturnType<typeof drizzle<typeof schema>>,
  post: {
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
  },
  currentUserId: number | null,
  pollMap?: Map<number, import('@hin/types').Poll>,
): Promise<Post> {
  const likesRes = await db
    .select({ value: count() })
    .from(schema.likes)
    .where(and(eq(schema.likes.postId, post.id), isNull(schema.likes.deletedAt)))
    .get();
  const likesCount = likesRes?.value || 0;

  const commentsRes = await db
    .select({ value: count() })
    .from(schema.comments)
    .where(and(eq(schema.comments.postId, post.id), sql`${schema.comments.deletedAt} IS NULL`))
    .get();
  const commentsCount = commentsRes?.value || 0;

  let hasLiked = false;
  if (currentUserId) {
    const likeRecord = await db
      .select()
      .from(schema.likes)
      .where(and(
        eq(schema.likes.postId, post.id),
        eq(schema.likes.userId, currentUserId),
        isNull(schema.likes.deletedAt),
      ))
      .get();
    hasLiked = !!likeRecord;
  }

  const bookmarksRes = await db
    .select({ value: count() })
    .from(schema.postBookmarks)
    .where(and(eq(schema.postBookmarks.postId, post.id), isNull(schema.postBookmarks.deletedAt)))
    .get();
  const bookmarksCount = bookmarksRes?.value || 0;

  const sharesRes = await db
    .select({ value: count() })
    .from(schema.postShares)
    .where(eq(schema.postShares.postId, post.id))
    .get();
  const sharesCount = sharesRes?.value || 0;

  let hasBookmarked = false;
  if (currentUserId) {
    const bookmarkRecord = await db
      .select()
      .from(schema.postBookmarks)
      .where(and(
        eq(schema.postBookmarks.postId, post.id),
        eq(schema.postBookmarks.userId, currentUserId),
        isNull(schema.postBookmarks.deletedAt),
      ))
      .get();
    hasBookmarked = !!bookmarkRecord;
  }

  const postType = (post.type ?? 'text') as Post['type'];
  const effectiveRootId = post.threadRootId ?? post.id;
  const threadReplyCount = await countThreadReplies(db, effectiveRootId);

  let linkPreview: Post['linkPreview'] = null;
  if (post.linkPreviewId) {
    const preview = await db
      .select()
      .from(schema.linkPreviews)
      .where(eq(schema.linkPreviews.id, post.linkPreviewId))
      .get();
    if (preview && !preview.fetchFailed) {
      linkPreview = {
        url: preview.url,
        title: preview.title,
        description: preview.description,
        imageUrl: preview.imageUrl,
        siteName: preview.siteName,
      };
    }
  }

  const response: Post = {
    id: post.id,
    userId: post.userId,
    username: post.username,
    authorAvatarUrl: post.authorAvatarUrl,
    authorRole: post.authorRole,
    type: postType,
    content: post.content,
    mediaUrls: parseMediaUrls(post.mediaUrls),
    createdAt: post.createdAt,
    likesCount,
    commentsCount,
    hasLiked,
    hasBookmarked,
    bookmarksCount,
    sharesCount,
    visibility: (post.visibility ?? 'public') as PostVisibility,
    pinnedAt: post.pinnedAt ?? null,
    threadRootId: post.threadRootId ?? null,
    parentPostId: post.parentPostId ?? null,
    threadReplyCount,
    linkPreview,
  };

  if (postType === 'poll') {
    response.poll = pollMap?.get(post.id) ?? await getPollByPostId(db, post.id, post.userId, currentUserId) ?? undefined;
  }

  return response;
}

// Get posts (cursor-paginated; order by id desc for stable cursors)
posts.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  const filterUserId = c.req.query('userId');
  const followingFeed = c.req.query('following') === 'true';
  const hashtagParam = c.req.query('hashtag');
  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');

  if (followingFeed && !authUser) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let limit = DEFAULT_FEED_LIMIT;
  if (limitParam !== undefined) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) return c.json({ error: 'Invalid limit' }, 400);
    limit = Math.min(parsed, MAX_FEED_LIMIT);
  }

  let cursor: number | null = null;
  if (cursorParam !== undefined && cursorParam !== '') {
    cursor = parseInt(cursorParam, 10);
    if (isNaN(cursor)) return c.json({ error: 'Invalid cursor' }, 400);
  }

  const postConditions = [
    sql`${schema.posts.deletedAt} IS NULL`,
    sql`${schema.users.deletedAt} IS NULL`,
    isNull(schema.posts.parentPostId),
  ];

  if (filterUserId) {
    const uid = parseInt(filterUserId);
    if (isNaN(uid)) return c.json({ error: 'Invalid userId' }, 400);

    const targetUser = await db.select({
      id: schema.users.id,
      deletedAt: schema.users.deletedAt,
    })
      .from(schema.users)
      .where(eq(schema.users.id, uid))
      .get();

    if (!targetUser || targetUser.deletedAt) {
      return c.json({ error: 'User not found' }, 404);
    }

    postConditions.push(eq(schema.posts.userId, uid));
    const visibilityCond = buildVisibilitySqlConditions(currentUserId, 'profile', uid);
    if (visibilityCond) postConditions.push(visibilityCond);
  } else if (followingFeed && authUser) {
    const feedUserIds = await getFollowingFeedUserIds(db, authUser.id);
    if (feedUserIds.length === 0) {
      return c.json({ posts: [], nextCursor: null } satisfies PostsPage);
    }
    postConditions.push(inArray(schema.posts.userId, feedUserIds));
    const visibilityCond = buildVisibilitySqlConditions(currentUserId, 'following');
    if (visibilityCond) postConditions.push(visibilityCond);
  } else {
    const visibilityCond = buildVisibilitySqlConditions(currentUserId, 'everyone');
    if (visibilityCond) postConditions.push(visibilityCond);
  }

  if (currentUserId) {
    const hiddenIds = await getHiddenAuthorIds(db, currentUserId);
    if (hiddenIds.length > 0) {
      postConditions.push(notInArray(schema.posts.userId, hiddenIds));
    }
  }

  if (hashtagParam) {
    const tag = hashtagParam.trim().toLowerCase();
    const taggedPosts = await db
      .select({ postId: schema.postHashtags.postId })
      .from(schema.postHashtags)
      .innerJoin(schema.hashtags, eq(schema.postHashtags.hashtagId, schema.hashtags.id))
      .where(eq(schema.hashtags.tag, tag))
      .all();
    const taggedPostIds = taggedPosts.map(r => r.postId);
    if (taggedPostIds.length === 0) {
      return c.json({ posts: [], nextCursor: null } satisfies PostsPage);
    }
    postConditions.push(inArray(schema.posts.id, taggedPostIds));
  }

  if (cursor !== null) {
    postConditions.push(lt(schema.posts.id, cursor));
  }

  const baseQuery = db.select({
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
  .where(and(...postConditions));

  const rows = filterUserId
    ? await baseQuery
      .orderBy(
        sql`CASE WHEN ${schema.posts.pinnedAt} IS NOT NULL THEN 0 ELSE 1 END`,
        desc(schema.posts.pinnedAt),
        desc(schema.posts.id),
      )
      .limit(limit + 1)
      .all()
    : await baseQuery
      .orderBy(desc(schema.posts.id))
      .limit(limit + 1)
      .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  const pollPostIds = pageRows.filter(p => p.type === 'poll').map(p => p.id);
  const postAuthorMap = new Map(pageRows.map(p => [p.id, p.userId]));
  const pollMap = await loadPollsForPosts(db, pollPostIds, postAuthorMap, currentUserId);

  const postsWithMetadata: Post[] = await Promise.all(
    pageRows.map(post => buildPostResponse(db, post, currentUserId, pollMap)),
  );

  const page: PostsPage = { posts: postsWithMetadata, nextCursor };
  return c.json(page);
});

// Get bookmarked posts for the current user (cursor = bookmark createdAt ISO string)
posts.get('/bookmarks', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');

  let limit = DEFAULT_FEED_LIMIT;
  if (limitParam !== undefined) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) return c.json({ error: 'Invalid limit' }, 400);
    limit = Math.min(parsed, MAX_FEED_LIMIT);
  }

  const conditions = [
    eq(schema.postBookmarks.userId, authUser.id),
    isNull(schema.postBookmarks.deletedAt),
    sql`${schema.posts.deletedAt} IS NULL`,
    sql`${schema.users.deletedAt} IS NULL`,
  ];

  if (cursorParam) {
    conditions.push(lt(schema.postBookmarks.createdAt, cursorParam));
  }

  const hiddenIds = await getHiddenAuthorIds(db, authUser.id);
  if (hiddenIds.length > 0) {
    conditions.push(notInArray(schema.posts.userId, hiddenIds));
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
      linkPreviewId: schema.posts.linkPreviewId,
      username: schema.users.username,
      authorAvatarUrl: schema.users.avatarUrl,
      authorRole: schema.users.role,
      bookmarkCreatedAt: schema.postBookmarks.createdAt,
    })
    .from(schema.postBookmarks)
    .innerJoin(schema.posts, eq(schema.postBookmarks.postId, schema.posts.id))
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.postBookmarks.createdAt))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].bookmarkCreatedAt : null;

  const pollPostIds = pageRows.filter(p => p.type === 'poll').map(p => p.id);
  const postAuthorMap = new Map(pageRows.map(p => [p.id, p.userId]));
  const pollMap = await loadPollsForPosts(db, pollPostIds, postAuthorMap, authUser.id);

  const postsWithMetadata: Post[] = await Promise.all(
    pageRows.map(({ bookmarkCreatedAt: _bc, ...post }) =>
      buildPostResponse(db, post, authUser.id, pollMap),
    ),
  );

  return c.json({ posts: postsWithMetadata, nextCursor } satisfies PostsPage);
});

// Create post
posts.post('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const body = await c.req.json();
  const parsed = parseCreatePostBody(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const data = parsed.data;
  const mediaUrls = Array.isArray(data.mediaUrls) ? data.mediaUrls.filter(Boolean) : [];
  const systemSettings = await getSystemSettings(db);
  const limitError = validatePostLimits(
    (data.content ?? '').trim(),
    mediaUrls.length,
    systemSettings,
  );
  if (limitError) {
    return c.json({ error: limitError }, 400);
  }
  if (mediaUrls.length > 0) {
    const validation = await validateOwnedPostMedia(db, authUser.id, mediaUrls, systemSettings.maxMediaPerPost);
    if (!validation.ok) {
      return c.json({ error: validation.error }, 400);
    }
  }

  const isPoll = 'type' in data && data.type === 'poll';
  const postType = isPoll ? 'poll' : 'text';

  let threadRootId: number | null = null;
  let parentPostId: number | null = null;
  let visibility: PostVisibility = data.visibility ?? 'public';

  const replyToPostId = 'replyToPostId' in data ? data.replyToPostId : undefined;
  if (replyToPostId) {
    if (isPoll) {
      return c.json({ error: 'Poll replies in threads are not supported' }, 400);
    }
    const threadResult = await validateThreadReply(db, authUser.id, replyToPostId);
    if (!threadResult.ok) {
      return c.json({ error: threadResult.error }, threadResult.code as 400 | 403 | 404);
    }
    threadRootId = threadResult.fields.threadRootId;
    parentPostId = threadResult.fields.parentPostId;
    const parentPost = await db.select().from(schema.posts).where(eq(schema.posts.id, replyToPostId)).get();
    if (parentPost) {
      visibility = (parentPost.visibility ?? 'public') as PostVisibility;
    }
  }

  const [inserted] = await db.insert(schema.posts).values({
    userId: authUser.id,
    type: postType,
    content: (data.content ?? '').trim(),
    mediaUrls: serializeMediaUrls(mediaUrls),
    visibility,
    threadRootId,
    parentPostId,
  }).returning();

  if (mediaUrls.length > 0) {
    await linkPostMedia(db, authUser.id, inserted.id, mediaUrls);
  }

  await syncPostHashtags(db, inserted.id, inserted.content);

  const firstUrl = parseFirstUrl(inserted.content);
  if (firstUrl) {
    const linkPreviewId = await getOrFetchLinkPreview(db, firstUrl);
    if (linkPreviewId !== null) {
      await db.update(schema.posts).set({ linkPreviewId }).where(eq(schema.posts.id, inserted.id)).run();
      inserted.linkPreviewId = linkPreviewId;
    }
  }

  if (isPoll && 'options' in data) {
    await createPollWithOptions(
      db,
      inserted.id,
      {
        question: data.question,
        endsAt: data.endsAt ?? null,
        maxSelections: data.maxSelections ?? 1,
        allowVoteChange: data.allowVoteChange,
        allowVoteRetraction: data.allowVoteRetraction,
        isAnonymous: data.isAnonymous,
        resultsVisibility: data.resultsVisibility,
      },
      data.options.map(o => o.label),
    );
  }

  const responsePost = await buildPostResponse(db, {
    id: inserted.id,
    userId: authUser.id,
    type: postType,
    content: inserted.content,
    mediaUrls: inserted.mediaUrls,
    visibility: inserted.visibility,
    createdAt: inserted.createdAt,
    pinnedAt: inserted.pinnedAt,
    threadRootId: inserted.threadRootId,
    parentPostId: inserted.parentPostId,
    linkPreviewId: inserted.linkPreviewId,
    username: authUser.username,
    authorAvatarUrl: authUser.avatarUrl,
    authorRole: authUser.role,
  }, authUser.id);

  if (!replyToPostId) {
    await notifyMentions(db, c.env, {
      content: inserted.content,
      senderId: authUser.id,
      senderUsername: authUser.username,
      entityId: inserted.id,
      context: 'post',
    });

    await broadcastEvent(c.env, { type: 'post_created', payload: { post: responsePost } });
  } else {
    await broadcastEvent(c.env, { type: 'post_updated', payload: { post: responsePost } });
  }

  return c.json(responsePost);
});

// Edit Post (Owner or Admin)
posts.put('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== post.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { content } = await c.req.json<{ content: string }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const systemSettings = await getSystemSettings(db);
  if (content.trim().length > systemSettings.maxPostLength) {
    return c.json({
      error: `Post is too long (max ${systemSettings.maxPostLength} characters)`,
    }, 400);
  }

  // Preserve previous version for admin/system audit trail
  if (content.trim() !== post.content) {
    await db.insert(schema.postEditHistory).values({
      postId,
      previousContent: post.content,
      previousMediaUrls: post.mediaUrls,
      editedBy: authUser.id,
    }).run();
  }

  const contentChanged = content.trim() !== post.content;

  let [updated] = await db.update(schema.posts)
    .set({ content: content.trim() })
    .where(eq(schema.posts.id, postId))
    .returning();

  if (contentChanged) {
    await syncPostHashtags(db, updated.id, updated.content);

    const firstUrl = parseFirstUrl(updated.content);
    const linkPreviewId = firstUrl ? await getOrFetchLinkPreview(db, firstUrl) : null;
    if (linkPreviewId !== updated.linkPreviewId) {
      [updated] = await db.update(schema.posts)
        .set({ linkPreviewId })
        .where(eq(schema.posts.id, postId))
        .returning();
    }
  }

  const author = await db.select({
    username: schema.users.username,
    avatarUrl: schema.users.avatarUrl,
    role: schema.users.role,
  }).from(schema.users).where(eq(schema.users.id, updated.userId)).get();

  const responsePost = await buildPostResponse(db, {
    id: updated.id,
    userId: updated.userId,
    type: updated.type,
    content: updated.content,
    mediaUrls: updated.mediaUrls,
    visibility: updated.visibility,
    createdAt: updated.createdAt,
    linkPreviewId: updated.linkPreviewId,
    username: author?.username || 'Unknown',
    authorAvatarUrl: author?.avatarUrl,
    authorRole: author?.role,
  }, authUser.id);

  await broadcastEvent(c.env, { type: 'post_updated', payload: { post: responsePost } });

  return c.json(responsePost);
});

// Toggle Like
posts.post('/:id/like', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const access = await assertCanViewPost(db, authUser.id, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const post = access.post;

  // Check if already liked
  const existingLike = await db.select().from(schema.likes).where(
    and(
      eq(schema.likes.postId, postId),
      eq(schema.likes.userId, authUser.id)
    )
  ).get();

  let liked = false;
  if (existingLike) {
    if (!existingLike.deletedAt) {
      // Unlike: Soft delete the existing active like record
      await db.update(schema.likes)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.likes.postId, postId),
            eq(schema.likes.userId, authUser.id)
          )
        ).run();
    } else {
      // Like: Re-activate the existing soft-deleted like record
      await db.update(schema.likes)
        .set({ deletedAt: null })
        .where(
          and(
            eq(schema.likes.postId, postId),
            eq(schema.likes.userId, authUser.id)
          )
        ).run();
      liked = true;
      // Do NOT notify again since the user has already liked this post before!
    }
  } else {
    // First time like: Insert a new like record
    await db.insert(schema.likes).values({
      postId,
      userId: authUser.id,
    }).run();
    liked = true;

    // Send real-time notification to post owner if it's someone else
    if (post.userId !== authUser.id) {
      const recipientSettings = await getOrCreateUserSettings(db, post.userId);
      if (
        isNotificationEnabled(recipientSettings, 'like')
        && await shouldDeliverNotification(db, post.userId, authUser.id)
      ) {
        const notificationContent = `${authUser.username} liked your post.`;
        
        const [notif] = await db.insert(schema.notifications).values({
          userId: post.userId,
          senderId: authUser.id,
          type: 'like',
          entityType: 'post',
          entityId: postId,
          content: notificationContent,
          read: 0,
        }).returning();

        const notifPayload: Notification = {
          id: notif.id,
          userId: post.userId,
          senderId: authUser.id,
          senderUsername: authUser.username,
          type: 'like',
          entityType: 'post',
          entityId: postId,
          commentId: null,
          content: notificationContent,
          read: false,
          createdAt: notif.createdAt,
        };

        // Call Durable Object to send real-time update
        try {
          const doId = c.env.REALTIME_DO.idFromName('global');
          const doStub = c.env.REALTIME_DO.get(doId);
          await doStub.fetch(new Request('http://realtime/broadcast-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: post.userId, notification: notifPayload }),
          }));
        } catch (e) {}
      }
    }
  }

  // Count total active likes
  const likesCountRes = await db.select({ value: count() }).from(schema.likes).where(and(eq(schema.likes.postId, postId), isNull(schema.likes.deletedAt))).get();
  const likesCount = likesCountRes?.value || 0;

  // Broadcast like update to ALL online users
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'like_update',
        payload: { postId, likesCount, userId: authUser.id, liked }
      }),
    }));
  } catch (e) {}

  return c.json({ liked, likesCount });
});

// Toggle bookmark
posts.post('/:id/bookmark', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'), 10);
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const access = await assertCanViewPost(db, authUser.id, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);

  const existing = await db.select().from(schema.postBookmarks).where(
    and(
      eq(schema.postBookmarks.postId, postId),
      eq(schema.postBookmarks.userId, authUser.id),
    ),
  ).get();

  let bookmarked = false;
  if (existing) {
    if (!existing.deletedAt) {
      await db.update(schema.postBookmarks)
        .set({ deletedAt: new Date().toISOString() })
        .where(and(
          eq(schema.postBookmarks.postId, postId),
          eq(schema.postBookmarks.userId, authUser.id),
        ))
        .run();
    } else {
      await db.update(schema.postBookmarks)
        .set({ deletedAt: null })
        .where(and(
          eq(schema.postBookmarks.postId, postId),
          eq(schema.postBookmarks.userId, authUser.id),
        ))
        .run();
      bookmarked = true;
    }
  } else {
    await db.insert(schema.postBookmarks).values({
      postId,
      userId: authUser.id,
    }).run();
    bookmarked = true;
  }

  const bookmarksCountRes = await db
    .select({ value: count() })
    .from(schema.postBookmarks)
    .where(and(eq(schema.postBookmarks.postId, postId), isNull(schema.postBookmarks.deletedAt)))
    .get();
  const bookmarksCount = bookmarksCountRes?.value || 0;

  return c.json({ bookmarked, bookmarksCount });
});

// Record share and return permalink
posts.post('/:id/share', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'), 10);
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const access = await assertCanViewPost(db, authUser.id, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);

  await db.insert(schema.postShares).values({
    postId,
    userId: authUser.id,
  }).run();

  const sharesCountRes = await db
    .select({ value: count() })
    .from(schema.postShares)
    .where(eq(schema.postShares.postId, postId))
    .get();
  const sharesCount = sharesCountRes?.value || 0;

  return c.json({ sharesCount, postId });
});

// Get post comments
posts.get('/:id/comments', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  const access = await assertCanViewPost(db, currentUserId, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);

  const postComments = await db
    .select({
      id: schema.comments.id,
      postId: schema.comments.postId,
      userId: schema.comments.userId,
      parentId: schema.comments.parentId,
      content: schema.comments.content,
      createdAt: schema.comments.createdAt,
      deletedAt: schema.comments.deletedAt,
      username: schema.users.username,
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.postId, postId))
    .orderBy(desc(schema.comments.createdAt))
    .all();

  const commentIds = postComments.map(c => c.id);
  const activeLikes = commentIds.length
    ? await db
        .select({
          commentId: schema.commentLikes.commentId,
          userId: schema.commentLikes.userId,
        })
        .from(schema.commentLikes)
        .where(
          and(
            inArray(schema.commentLikes.commentId, commentIds),
            isNull(schema.commentLikes.deletedAt)
          )
        )
        .all()
    : [];

  const likesCountByComment = new Map<number, number>();
  const likedByCurrentUser = new Set<number>();
  for (const like of activeLikes) {
    likesCountByComment.set(like.commentId, (likesCountByComment.get(like.commentId) || 0) + 1);
    if (currentUserId && like.userId === currentUserId) {
      likedByCurrentUser.add(like.commentId);
    }
  }

  // Redact soft deleted comments content
  const hiddenIds = currentUserId ? await getHiddenAuthorIds(db, currentUserId) : [];
  const visibleComments = hiddenIds.length > 0
    ? postComments.filter(comment => !hiddenIds.includes(comment.userId))
    : postComments;

  const redactedComments: Comment[] = visibleComments.map(comment => {
    const likesCount = likesCountByComment.get(comment.id) || 0;
    const hasLiked = likedByCurrentUser.has(comment.id);
    if (comment.deletedAt) {
      return {
        ...comment,
        content: '[Comment deleted]',
        username: 'deleted',
        likesCount,
        hasLiked,
      };
    }
    return { ...comment, likesCount, hasLiked };
  });

  return c.json(redactedComments);
});

posts.post('/:id/pin', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const postId = parseInt(c.req.param('id'), 10);
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await pinPost(db, authUser.id, postId);
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  }

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  const author = await db.select({
    username: schema.users.username,
    avatarUrl: schema.users.avatarUrl,
    role: schema.users.role,
  }).from(schema.users).where(eq(schema.users.id, post.userId)).get();

  const responsePost = await buildPostResponse(db, {
    id: post.id,
    userId: post.userId,
    type: post.type,
    content: post.content,
    mediaUrls: post.mediaUrls,
    visibility: post.visibility,
    createdAt: post.createdAt,
    pinnedAt: post.pinnedAt,
    threadRootId: post.threadRootId,
    parentPostId: post.parentPostId,
    username: author?.username || 'Unknown',
    authorAvatarUrl: author?.avatarUrl,
    authorRole: author?.role,
  }, authUser.id);

  return c.json(responsePost);
});

posts.delete('/:id/pin', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const postId = parseInt(c.req.param('id'), 10);
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const result = await unpinPost(db, authUser.id, postId);
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  }

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  const author = await db.select({
    username: schema.users.username,
    avatarUrl: schema.users.avatarUrl,
    role: schema.users.role,
  }).from(schema.users).where(eq(schema.users.id, post.userId)).get();

  const responsePost = await buildPostResponse(db, {
    id: post.id,
    userId: post.userId,
    type: post.type,
    content: post.content,
    mediaUrls: post.mediaUrls,
    visibility: post.visibility,
    createdAt: post.createdAt,
    pinnedAt: post.pinnedAt,
    threadRootId: post.threadRootId,
    parentPostId: post.parentPostId,
    username: author?.username || 'Unknown',
    authorAvatarUrl: author?.avatarUrl,
    authorRole: author?.role,
  }, authUser.id);

  return c.json(responsePost);
});

posts.get('/:id/thread', async (c) => {
  const postId = parseInt(c.req.param('id'), 10);
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  const access = await assertCanViewThread(db, currentUserId, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);

  const rows = await getThreadPostRows(db, access.rootId);
  if (rows.length === 0) return c.json({ error: 'Post not found' }, 404);

  const pollPostIds = rows.filter(p => p.type === 'poll').map(p => p.id);
  const postAuthorMap = new Map(rows.map(p => [p.id, p.userId]));
  const pollMap = await loadPollsForPosts(db, pollPostIds, postAuthorMap, currentUserId);

  const postsWithMetadata = await Promise.all(
    rows.map(row => buildPostResponse(db, row, currentUserId, pollMap)),
  );

  const page: PostThreadPage = {
    root: postsWithMetadata[0],
    replies: postsWithMetadata.slice(1),
  };
  return c.json(page);
});

// Get single post (permalink)
posts.get('/:id', async (c) => {
  const postId = parseInt(c.req.param('id'), 10);
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  const access = await assertCanViewPost(db, currentUserId, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);

  const row = await db
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
    .where(and(eq(schema.posts.id, postId), sql`${schema.users.deletedAt} IS NULL`))
    .get();

  if (!row) return c.json({ error: 'Post not found' }, 404);

  const post = await buildPostResponse(db, row, currentUserId);
  return c.json(post);
});

// Create comment
posts.post('/:id/comments', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const access = await assertCanViewPost(db, authUser.id, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const post = access.post;

  const { content, parentId } = await c.req.json<{ content: string; parentId?: number | null }>();
  if (!content || content.trim() === '') {
    return c.json({ error: 'Content cannot be empty' }, 400);
  }

  const [inserted] = await db.insert(schema.comments).values({
    postId,
    userId: authUser.id,
    parentId: parentId || null,
    content: content.trim(),
  }).returning();

  const commentResponse: Comment = {
    id: inserted.id,
    postId: inserted.postId,
    userId: authUser.id,
    username: authUser.username,
    parentId: inserted.parentId,
    content: inserted.content,
    createdAt: inserted.createdAt,
    deletedAt: inserted.deletedAt,
    likesCount: 0,
    hasLiked: false,
  };

  // Determine recipient
  let recipientId = post.userId;
  let notificationContent = `${authUser.username} commented on your post: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;

  if (parentId) {
    const parentComment = await db.select().from(schema.comments).where(eq(schema.comments.id, parentId)).get();
    if (parentComment && parentComment.userId !== authUser.id) {
      recipientId = parentComment.userId;
      notificationContent = `${authUser.username} replied to your comment: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;
    }
  }

  // Send real-time notification to recipient if it's someone else
  if (recipientId !== authUser.id) {
    const recipientSettings = await getOrCreateUserSettings(db, recipientId);
    if (
      isNotificationEnabled(recipientSettings, 'comment')
      && await shouldDeliverNotification(db, recipientId, authUser.id)
    ) {
      const [notif] = await db.insert(schema.notifications).values({
        userId: recipientId,
        senderId: authUser.id,
        type: 'comment',
        entityType: 'post',
        entityId: postId,
        commentId: inserted.id,
        content: notificationContent,
        read: 0,
      }).returning();

      const notifPayload: Notification = {
        id: notif.id,
        userId: recipientId,
        senderId: authUser.id,
        senderUsername: authUser.username,
        type: 'comment',
        entityType: 'post',
        entityId: postId,
        commentId: inserted.id,
        content: notificationContent,
        read: false,
        createdAt: notif.createdAt,
      };

      try {
        const doId = c.env.REALTIME_DO.idFromName('global');
        const doStub = c.env.REALTIME_DO.get(doId);
        await doStub.fetch(new Request('http://realtime/broadcast-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId, notification: notifPayload }),
        }));
      } catch (e) {}
    }
  }

  await notifyMentions(db, c.env, {
    content: inserted.content,
    senderId: authUser.id,
    senderUsername: authUser.username,
    entityId: postId,
    commentId: inserted.id,
    context: 'comment',
  });

  // Broadcast comment creation
  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'comment_created',
        payload: { comment: commentResponse }
      }),
    }));
  } catch (e) {}

  return c.json(commentResponse);
});

// Vote on poll
posts.post('/:id/poll/vote', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const access = await assertCanViewPost(db, authUser.id, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const post = access.post;
  if (post.type !== 'poll') return c.json({ error: 'Not a poll post' }, 400);

  const body = await c.req.json();
  const parsed = VotePollSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid vote' }, 400);
  }

  const result = await castVote(db, postId, authUser.id, parsed.data.optionIds);
  if (result.error) return c.json({ error: result.error }, result.status ?? 400);

  await broadcastEvent(c.env, {
    type: 'poll_vote_update',
    payload: { postId, poll: result.poll },
  });

  return c.json({ poll: result.poll });
});

// Retract poll vote
posts.delete('/:id/poll/vote', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const access = await assertCanViewPost(db, authUser.id, postId);
  if (!access.ok) return c.json({ error: access.error }, access.status);
  const post = access.post;
  if (post.type !== 'poll') return c.json({ error: 'Not a poll post' }, 400);

  const result = await retractVote(db, postId, authUser.id);
  if (result.error) return c.json({ error: result.error }, result.status ?? 400);

  await broadcastEvent(c.env, {
    type: 'poll_vote_update',
    payload: { postId, poll: result.poll },
  });

  return c.json({ poll: result.poll });
});

// Close poll (author or admin)
posts.post('/:id/poll/close', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));
  if (isNaN(postId)) return c.json({ error: 'Invalid post id' }, 400);

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post || post.deletedAt) return c.json({ error: 'Post not found' }, 404);
  if (post.type !== 'poll') return c.json({ error: 'Not a poll post' }, 400);

  if (authUser.role !== 'admin' && authUser.id !== post.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const result = await closePoll(db, postId);
  if (result.error) return c.json({ error: result.error }, result.status ?? 400);

  await broadcastEvent(c.env, {
    type: 'poll_closed',
    payload: { postId, poll: result.poll },
  });

  return c.json({ poll: result.poll });
});

// Delete Post (Owner or Admin) - Soft Delete
posts.delete('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const postId = parseInt(c.req.param('id'));

  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return c.json({ error: 'Post not found' }, 404);

  if (authUser.role !== 'admin' && authUser.id !== post.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(schema.posts)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.posts.id, postId))
    .run();

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'post_deleted', payload: { postId } }),
    }));
  } catch (e) {}

  return c.json({ success: true });
});

export default posts;
