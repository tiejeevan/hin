import { and, eq, isNull, like, or } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@hin/db';

export type PromoteCandidateUser = {
  id: number;
  username: string;
  role: 'user';
};

export function normalizeAdminUserSearchQuery(q: string): string {
  return q.trim().replace(/^[@#]/, '');
}

/** Matches moderator promote UI: empty → no query; 1–2 chars → numeric ID only; 3+ → username search. */
export function adminUserSearchShouldRun(q: string): boolean {
  const normalized = normalizeAdminUserSearchQuery(q);
  if (!normalized) return false;
  if (normalized.length >= 3) return true;
  return /^\d+$/.test(normalized);
}

function escapeLikeFragment(raw: string): string {
  return raw.replace(/[%_\\]/g, '\\$&');
}

function rankCandidate(normalized: string, user: PromoteCandidateUser): number {
  const q = normalized.toLowerCase();
  const name = user.username.toLowerCase();
  if (String(user.id) === normalized) return 3000;
  if (name === q) return 2500;
  if (name.startsWith(q)) return 2000 - name.length;
  const idx = name.indexOf(q);
  if (idx !== -1) return 1000 - idx;
  return 100;
}

const promoteUserFields = {
  id: schema.users.id,
  username: schema.users.username,
  role: schema.users.role,
};

const promoteUserWhere = and(
  eq(schema.users.role, 'user'),
  isNull(schema.users.deletedAt),
);

export async function searchPromoteCandidateUsers(
  db: DrizzleD1Database<typeof schema>,
  normalized: string,
  limit = 50,
): Promise<PromoteCandidateUser[]> {
  if (!adminUserSearchShouldRun(normalized)) return [];

  if (normalized.length < 3) {
    const id = Number.parseInt(normalized, 10);
    if (!Number.isFinite(id)) return [];
    const row = await db
      .select(promoteUserFields)
      .from(schema.users)
      .where(and(promoteUserWhere, eq(schema.users.id, id)))
      .get();
    if (!row || row.role !== 'user') return [];
    return [{ id: row.id, username: row.username, role: 'user' }];
  }

  const likePattern = `%${escapeLikeFragment(normalized)}%`;
  const numericId = /^\d+$/.test(normalized) ? Number.parseInt(normalized, 10) : null;

  const matchWhere =
    numericId != null
      ? or(like(schema.users.username, likePattern), eq(schema.users.id, numericId))
      : like(schema.users.username, likePattern);

  const rows = await db
    .select(promoteUserFields)
    .from(schema.users)
    .where(and(promoteUserWhere, matchWhere))
    .limit(Math.min(limit, 50))
    .all();

  const users: PromoteCandidateUser[] = rows
    .filter((r) => r.role === 'user')
    .map((r) => ({ id: r.id, username: r.username, role: 'user' as const }));

  users.sort((a, b) => rankCandidate(normalized, b) - rankCandidate(normalized, a));
  return users.slice(0, limit);
}
