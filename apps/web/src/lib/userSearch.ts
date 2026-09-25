import type { User as UserType } from '@hin/types';

export function normalizeAdminUserSearchQuery(q: string): string {
  return q.trim().replace(/^[@#]/, '');
}

/** Same rules as GET /api/admin/users/search — used for empty-state / hint UI only. */
export function adminUserSearchShouldRun(q: string): boolean {
  const normalized = normalizeAdminUserSearchQuery(q);
  if (!normalized) return false;
  if (normalized.length >= 3) return true;
  return /^\d+$/.test(normalized);
}

/**
 * Subsequence fuzzy match: every query char must appear in order in the target.
 * Returns a score (higher = better) or null if there's no match.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;

  const substringIdx = t.indexOf(q);
  if (substringIdx !== -1) return 1000 - substringIdx;

  let score = 0;
  let tIdx = 0;
  let prevMatchIdx = -2;
  for (let qIdx = 0; qIdx < q.length; qIdx++) {
    const found = t.indexOf(q[qIdx], tIdx);
    if (found === -1) return null;
    score += found === prevMatchIdx + 1 ? 5 : 1;
    prevMatchIdx = found;
    tIdx = found + 1;
  }
  return score;
}

export function matchesSearch(query: string, user: UserType): number | null {
  const trimmed = query.trim().replace(/^[@#]/, '');
  if (!trimmed) return 0;
  const usernameScore = fuzzyScore(trimmed, user.username);
  const idScore = String(user.id) === trimmed ? 2000 : null;
  if (usernameScore === null && idScore === null) return null;
  return Math.max(usernameScore ?? -Infinity, idScore ?? -Infinity);
}
