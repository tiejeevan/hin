import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchUsers, searchPosts, searchHashtags, searchMentions } from './search';
import { users, posts, hashtags, postHashtags, userFollows } from '@hin/db';

// Simple mock for D1 database query chains
function createMockDb(mockResults: any[]) {
  const allResultsQueue = [...mockResults];
  const queryMock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    all: vi.fn().mockImplementation(async () => allResultsQueue.shift() ?? []),
    get: vi.fn().mockImplementation(async () => {
      const next = allResultsQueue.shift();
      return Array.isArray(next) ? (next[0] ?? null) : (next ?? null);
    }),
  };
  return queryMock as any;
}

// Mock modules imported inside search.ts
vi.mock('./users', () => ({
  USER_PUBLIC_FIELDS: {},
  toPublicUser: vi.fn((user, extras) => ({
    id: user.id,
    username: user.username,
    bio: user.bio,
    followStatus: extras?.followStatus ?? 'none',
  })),
}));

vi.mock('./blocks', () => ({
  getHiddenAuthorIds: vi.fn().mockResolvedValue([99]), // Mocked blocked user ID
}));

vi.mock('./postVisibility', () => ({
  buildVisibilitySqlConditions: vi.fn().mockReturnValue(null),
}));

vi.mock('./polls', () => ({
  loadPollsForPosts: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./gamification/equipped', () => ({
  loadEquippedBadgesForUsers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('./gamification/settings', () => ({
  isGamificationEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('../routes/posts', () => ({
  buildPostResponse: vi.fn((db, post) => post),
}));

describe('Search Service Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchUsers', () => {
    it('returns empty array when no users match', async () => {
      const db = createMockDb([[]]);
      const results = await searchUsers(db, 'nonexistent', 1, 10, 0);
      expect(results).toEqual([]);
    });

    it('queries and returns matched users sorted alphabetically for guests', async () => {
      const mockUsers = [
        { id: 2, username: 'bob', bio: 'developer' },
        { id: 3, username: 'alice', bio: 'designer' },
      ];
      const db = createMockDb([mockUsers]);
      const results = await searchUsers(db, 'alice', null, 10, 0);

      // Verify mapping and sorting (alice should be first alphabetically)
      expect(results).toHaveLength(2);
      expect(results[0].username).toBe('alice');
      expect(results[1].username).toBe('bob');
    });

    it('preserves followStatus precedence via batched lookups', async () => {
      const viewerId = 1;
      const mockUsers = [
        { id: 2, username: 'zara', bio: 'followed by viewer' },
        { id: 3, username: 'amy', bio: 'requested by viewer' },
        { id: 4, username: 'mike', bio: 'follows viewer' },
      ];
      const db = createMockDb([
        mockUsers,
        [{ followingId: 2 }],
        [],
        [{ followerId: 4 }],
        [{ targetId: 3 }],
      ]);

      const results = await searchUsers(db, 'a', viewerId, 10, 0);

      expect(results).toHaveLength(3);
      expect(results.find(u => u.id === 2)?.followStatus).toBe('following');
      expect(results.find(u => u.id === 3)?.followStatus).toBe('requested');
      expect(results.find(u => u.id === 4)?.followStatus).toBe('follows_you');
    });
  });

  describe('searchPosts', () => {
    it('returns empty array when no posts match', async () => {
      const db = createMockDb([[]]);
      const results = await searchPosts(db, 'no posts', 1, 10, 0);
      expect(results).toEqual([]);
    });

    it('returns formatted posts matching the content pattern', async () => {
      const mockPosts = [
        { id: 10, userId: 2, content: 'testing post', username: 'bob' },
      ];
      const db = createMockDb([mockPosts]);
      const results = await searchPosts(db, 'testing', 1, 10, 0);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(10);
      expect(results[0].username).toBe('bob');
    });
  });

  describe('searchHashtags', () => {
    it('normalizes queries and retrieves matched hashtags with counts', async () => {
      const mockTags = [
        { tag: 'svelte', count: 12 },
        { tag: 'react', count: 5 },
      ];
      const db = createMockDb([mockTags]);
      const results = await searchHashtags(db, '#Svelte', 10, 0);

      expect(results).toHaveLength(2);
      expect(results[0].tag).toBe('svelte');
      expect(results[0].count).toBe(12);
    });
  });

  describe('searchMentions', () => {
    it('queries posts with mention @ prefix', async () => {
      const mockPosts = [
        { id: 11, userId: 2, content: 'hey @jane check this', username: 'bob' },
      ];
      const db = createMockDb([mockPosts]);
      const results = await searchMentions(db, '@jane', 1, 10, 0);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(11);
      expect(results[0].content).toContain('@jane');
    });
  });
});
