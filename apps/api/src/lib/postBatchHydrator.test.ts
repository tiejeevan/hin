import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPostsResponseBatch, type PostHydrationRow } from './postBatchHydrator';
import { loadPollsForPosts } from './polls';
import { loadEquippedBadgesForUsers } from './gamification/equipped';
import { isGamificationEnabled } from './gamification/settings';

vi.mock('./polls', () => ({
  loadPollsForPosts: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./gamification/equipped', () => ({
  loadEquippedBadgesForUsers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./gamification/settings', () => ({
  isGamificationEnabled: vi.fn().mockResolvedValue(false),
}));

/**
 * Mock D1/drizzle chain. `buildPostsResponseBatch` fires `.all()` in a fixed order
 * when creating promises (before awaiting), so a FIFO queue is deterministic.
 *
 * Order with currentUserId + linkPreviewIds:
 * 1 likesCount, 2 commentsCount, 3 bookmarksCount, 4 sharesCount,
 * 5 threadReplyCount, 6 hasLiked, 7 hasBookmarked, 8 linkPreviews
 *
 * Without currentUserId, steps 6–7 are skipped (resolved without db).
 * Without linkPreviewIds, step 8 is skipped.
 */
function createMockDb(allResults: unknown[]) {
  const queue = [...allResults];
  const queryMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    all: vi.fn().mockImplementation(async () => queue.shift() ?? []),
    get: vi.fn().mockImplementation(async () => {
      const next = queue.shift();
      return Array.isArray(next) ? (next[0] ?? null) : (next ?? null);
    }),
  };
  return queryMock as any;
}

function basePost(overrides: Partial<PostHydrationRow> = {}): PostHydrationRow {
  return {
    id: 1,
    userId: 10,
    type: 'text',
    content: 'hello',
    mediaUrls: null,
    visibility: 'public',
    createdAt: '2024-01-01T00:00:00.000Z',
    pinnedAt: null,
    threadRootId: null,
    parentPostId: null,
    linkPreviewId: null,
    username: 'alice',
    authorAvatarUrl: null,
    authorRole: 'user',
    ...overrides,
  };
}

describe('buildPostsResponseBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGamificationEnabled).mockResolvedValue(false);
    vi.mocked(loadEquippedBadgesForUsers).mockResolvedValue(new Map());
    vi.mocked(loadPollsForPosts).mockResolvedValue(new Map());
  });

  it('returns empty array without querying when posts is empty', async () => {
    const db = createMockDb([]);
    const result = await buildPostsResponseBatch(db, [], 1);
    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
    expect(loadPollsForPosts).not.toHaveBeenCalled();
  });

  it('hydrates a single post with defaults when relations are missing', async () => {
    const db = createMockDb([
      [], // likes
      [], // comments
      [], // bookmarks
      [], // shares
      [], // thread replies
      [], // hasLiked
      [], // hasBookmarked
    ]);

    const [post] = await buildPostsResponseBatch(db, [basePost()], 42);

    expect(post).toMatchObject({
      id: 1,
      userId: 10,
      username: 'alice',
      likesCount: 0,
      commentsCount: 0,
      bookmarksCount: 0,
      sharesCount: 0,
      hasLiked: false,
      hasBookmarked: false,
      threadReplyCount: 0,
      linkPreview: null,
      authorEquippedBadges: [],
      mediaUrls: [],
      visibility: 'public',
    });
    expect(post.poll).toBeUndefined();
  });

  it('maps counts, viewer flags, link preview, and badges for multiple posts', async () => {
    vi.mocked(isGamificationEnabled).mockResolvedValue(true);
    vi.mocked(loadEquippedBadgesForUsers).mockResolvedValue(
      new Map([
        [10, [{ id: 1, name: 'Starter', imageUrl: '/b1.png' }]],
        [20, []],
      ]),
    );

    const posts = [
      basePost({ id: 1, userId: 10, linkPreviewId: 5, username: 'alice' }),
      basePost({ id: 2, userId: 20, username: 'bob', content: 'second' }),
    ];

    const db = createMockDb([
      [
        { postId: 1, value: 3 },
        { postId: 2, value: 1 },
      ], // likes
      [{ postId: 1, value: 2 }], // comments
      [{ postId: 2, value: 4 }], // bookmarks
      [{ postId: 1, value: 1 }], // shares
      [{ rootId: 1, value: 7 }], // thread replies for root 1
      [{ postId: 1 }], // hasLiked
      [{ postId: 2 }], // hasBookmarked
      [
        {
          id: 5,
          url: 'https://example.com',
          title: 'Example',
          description: 'Desc',
          imageUrl: null,
          siteName: 'Example',
          fetchFailed: 0,
        },
      ], // link previews
    ]);

    const result = await buildPostsResponseBatch(db, posts, 99);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
    expect(result[0]).toMatchObject({
      likesCount: 3,
      commentsCount: 2,
      sharesCount: 1,
      bookmarksCount: 0,
      hasLiked: true,
      hasBookmarked: false,
      threadReplyCount: 7,
      authorEquippedBadges: [{ id: 1, name: 'Starter', imageUrl: '/b1.png' }],
      linkPreview: {
        url: 'https://example.com',
        title: 'Example',
        description: 'Desc',
        imageUrl: null,
        siteName: 'Example',
      },
    });
    expect(result[1]).toMatchObject({
      likesCount: 1,
      commentsCount: 0,
      bookmarksCount: 4,
      sharesCount: 0,
      hasLiked: false,
      hasBookmarked: true,
      threadReplyCount: 0,
      authorEquippedBadges: [],
      linkPreview: null,
    });
    expect(loadEquippedBadgesForUsers).toHaveBeenCalledWith(db, [10, 20]);
  });

  it('skips viewer flag queries when currentUserId is null', async () => {
    const db = createMockDb([
      [], // likes
      [], // comments
      [], // bookmarks
      [], // shares
      [], // thread replies
    ]);

    const [post] = await buildPostsResponseBatch(db, [basePost()], null);

    expect(post.hasLiked).toBe(false);
    expect(post.hasBookmarked).toBe(false);
    // only 5 .all() calls (no hasLiked/hasBookmarked/linkPreview)
    expect(db.all).toHaveBeenCalledTimes(5);
  });

  it('ignores failed link previews', async () => {
    const db = createMockDb([
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: 9,
          url: 'https://fail.example',
          title: null,
          description: null,
          imageUrl: null,
          siteName: null,
          fetchFailed: 1,
        },
      ],
    ]);

    const [post] = await buildPostsResponseBatch(
      db,
      [basePost({ linkPreviewId: 9 })],
      1,
    );

    expect(post.linkPreview).toBeNull();
  });

  it('attaches poll from provided pollMap for poll posts', async () => {
    const poll = {
      id: 1,
      postId: 1,
      question: 'Q?',
      allowMultiple: false,
      endsAt: null,
      closedAt: null,
      options: [],
      totalVotes: 0,
      viewerHasVoted: false,
    };
    const pollMap = new Map([[1, poll as any]]);

    const db = createMockDb([[], [], [], [], [], [], []]);

    const [post] = await buildPostsResponseBatch(
      db,
      [basePost({ type: 'poll' })],
      1,
      pollMap,
    );

    expect(post.poll).toEqual(poll);
    expect(loadPollsForPosts).not.toHaveBeenCalled();
  });

  it('loads polls via loadPollsForPosts when pollMap is omitted', async () => {
    const poll = { id: 2, postId: 3, question: 'Loaded?' };
    vi.mocked(loadPollsForPosts).mockResolvedValue(new Map([[3, poll as any]]));

    const db = createMockDb([[], [], [], [], [], [], []]);

    const [post] = await buildPostsResponseBatch(
      db,
      [basePost({ id: 3, type: 'poll' })],
      1,
    );

    expect(loadPollsForPosts).toHaveBeenCalled();
    expect(post.poll).toEqual(poll);
  });

  it('preserves input order', async () => {
    const db = createMockDb([[], [], [], [], [], [], []]);
    const posts = [
      basePost({ id: 30, content: 'c' }),
      basePost({ id: 10, content: 'a' }),
      basePost({ id: 20, content: 'b' }),
    ];

    const result = await buildPostsResponseBatch(db, posts, 1);
    expect(result.map((p) => p.id)).toEqual([30, 10, 20]);
  });
});
