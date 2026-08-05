import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPostsResponseBatch, type PostHydrationRow } from './postBatchHydrator';
import { loadPollsForPosts } from './polls';
import { loadEquippedBadgesForUsers } from './gamification/equipped';
import { isGamificationEnabled } from './gamification/settings';
import { canViewPost } from './postVisibility';
import { getHiddenAuthorIds } from './blocks';

vi.mock('./polls', () => ({
  loadPollsForPosts: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./gamification/equipped', () => ({
  loadEquippedBadgesForUsers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./gamification/settings', () => ({
  isGamificationEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('./postVisibility', () => ({
  canViewPost: vi.fn().mockResolvedValue(true),
}));

vi.mock('./blocks', () => ({
  getHiddenAuthorIds: vi.fn().mockResolvedValue([]),
}));

/**
 * Order with currentUserId, no linkPreviewIds, no nested originals:
 * 1 likes, 2 comments, 3 bookmarks, 4 shares, 5 repostsCount,
 * 6 hasLiked, 7 hasBookmarked, 8 hasReposted
 */
function createMockDb(allResults: unknown[]) {
  const queue = [...allResults];
  const queryMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
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
    repostOfPostId: null,
    isQuote: 0,
    username: 'alice',
    authorAvatarUrl: null,
    authorRole: 'user',
    ...overrides,
  };
}

function emptyBatch(withViewer = true): unknown[] {
  const base = [[], [], [], [], []]; // likes, comments, bookmarks, shares, reposts
  if (!withViewer) return base;
  return [...base, [], [], []]; // hasLiked, hasBookmarked, hasReposted
}

describe('buildPostsResponseBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGamificationEnabled).mockResolvedValue(false);
    vi.mocked(loadEquippedBadgesForUsers).mockResolvedValue(new Map());
    vi.mocked(loadPollsForPosts).mockResolvedValue(new Map());
    vi.mocked(canViewPost).mockResolvedValue(true);
    vi.mocked(getHiddenAuthorIds).mockResolvedValue([]);
  });

  it('returns empty array without querying when posts is empty', async () => {
    const db = createMockDb([]);
    const result = await buildPostsResponseBatch(db, [], 1);
    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
    expect(loadPollsForPosts).not.toHaveBeenCalled();
  });

  it('hydrates a single post with defaults when relations are missing', async () => {
    const db = createMockDb(emptyBatch(true));

    const [post] = await buildPostsResponseBatch(db, [basePost()], 42);

    expect(post).toMatchObject({
      id: 1,
      userId: 10,
      username: 'alice',
      likesCount: 0,
      commentsCount: 0,
      bookmarksCount: 0,
      sharesCount: 0,
      repostsCount: 0,
      hasLiked: false,
      hasBookmarked: false,
      hasReposted: false,
      threadReplyCount: 0,
      linkPreview: null,
      authorEquippedBadges: [],
      mediaUrls: [],
      visibility: 'public',
      isQuote: false,
      repostOfPostId: null,
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
      ],
      [{ postId: 1, value: 2 }],
      [{ postId: 2, value: 4 }],
      [{ postId: 1, value: 1 }],
      [{ postId: 1, value: 2 }], // silent reposts of post 1
      [{ postId: 1 }],
      [{ postId: 2 }],
      [{ postId: 1 }], // hasReposted
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
      ],
    ]);

    const result = await buildPostsResponseBatch(db, posts, 99);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      likesCount: 3,
      commentsCount: 2,
      sharesCount: 1,
      bookmarksCount: 0,
      repostsCount: 2,
      hasLiked: true,
      hasBookmarked: false,
      hasReposted: true,
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
      hasBookmarked: true,
      hasReposted: false,
      repostsCount: 0,
    });
  });

  it('skips viewer flag queries when currentUserId is null', async () => {
    const db = createMockDb(emptyBatch(false));

    const [post] = await buildPostsResponseBatch(db, [basePost()], null);

    expect(post.hasLiked).toBe(false);
    expect(post.hasBookmarked).toBe(false);
    expect(post.hasReposted).toBe(false);
    expect(db.all).toHaveBeenCalledTimes(5);
  });

  it('ignores failed link previews', async () => {
    const db = createMockDb([
      ...emptyBatch(true),
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

    const db = createMockDb(emptyBatch(true));

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

    const db = createMockDb(emptyBatch(true));

    const [post] = await buildPostsResponseBatch(
      db,
      [basePost({ id: 3, type: 'poll' })],
      1,
    );

    expect(loadPollsForPosts).toHaveBeenCalled();
    expect(post.poll).toEqual(poll);
  });

  it('preserves input order', async () => {
    const db = createMockDb(emptyBatch(true));
    const posts = [
      basePost({ id: 30, content: 'c' }),
      basePost({ id: 10, content: 'a' }),
      basePost({ id: 20, content: 'b' }),
    ];

    const result = await buildPostsResponseBatch(db, posts, 1);
    expect(result.map((p) => p.id)).toEqual([30, 10, 20]);
  });
});
