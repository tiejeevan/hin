import { useCallback, useState } from 'react';
import { WELCOME_MOCK_POSTS } from './welcomeMockPosts';
import type { WelcomeMockPostView } from './welcomePhoneTypes';
import { WELCOME_PHONE_MAX } from './welcomePhoneTypes';

const LIKES_STORAGE_KEY = 'hin_welcome_mock_likes';

function loadLikedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(LIKES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function saveLikedIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function initialPosts(): WelcomeMockPostView[] {
  const liked = loadLikedIds();
  return WELCOME_MOCK_POSTS.slice(0, WELCOME_PHONE_MAX).map(mock => ({
    ...mock,
    hasLiked: liked.has(mock.id),
    likesCount: mock.likesCount + (liked.has(mock.id) ? 1 : 0),
  }));
}

export function useWelcomePhoneFeed() {
  const [posts, setPosts] = useState<WelcomeMockPostView[]>(initialPosts);

  const toggleLike = useCallback((mockId: string) => {
    setPosts(prev => {
      const liked = loadLikedIds();
      let nextLiked = false;
      const next = prev.map(p => {
        if (p.id !== mockId) return p;
        nextLiked = !p.hasLiked;
        if (nextLiked) liked.add(mockId);
        else liked.delete(mockId);
        const base = WELCOME_MOCK_POSTS.find(m => m.id === mockId)?.likesCount ?? p.likesCount;
        return {
          ...p,
          hasLiked: nextLiked,
          likesCount: Math.max(0, base + (nextLiked ? 1 : 0)),
        };
      });
      saveLikedIds(liked);
      return next;
    });
  }, []);

  return { posts, toggleLike };
}
