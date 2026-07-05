import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, desc, lt } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { MuteListUser, MuteStatus } from '@hin/types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const LIST_PAGE_SIZE = 20;

export async function isMuted(
  db: Db,
  muterId: number,
  mutedId: number,
): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.userMutes)
    .where(
      and(
        eq(schema.userMutes.muterId, muterId),
        eq(schema.userMutes.mutedId, mutedId),
        isNull(schema.userMutes.deletedAt),
      ),
    )
    .get();
  return !!row;
}

export async function getMuteStatus(
  db: Db,
  viewerId: number | null,
  targetId: number,
): Promise<MuteStatus> {
  if (!viewerId || viewerId === targetId) return 'none';
  const muted = await isMuted(db, viewerId, targetId);
  return muted ? 'muted' : 'none';
}

export async function getMutedUserIds(db: Db, userId: number): Promise<number[]> {
  const rows = await db
    .select({ mutedId: schema.userMutes.mutedId })
    .from(schema.userMutes)
    .where(
      and(
        eq(schema.userMutes.muterId, userId),
        isNull(schema.userMutes.deletedAt),
      ),
    )
    .all();
  return rows.map(r => r.mutedId);
}

async function upsertActiveMute(db: Db, muterId: number, mutedId: number) {
  const existing = await db
    .select()
    .from(schema.userMutes)
    .where(
      and(
        eq(schema.userMutes.muterId, muterId),
        eq(schema.userMutes.mutedId, mutedId),
      ),
    )
    .get();

  if (existing) {
    if (!existing.deletedAt) return;
    await db
      .update(schema.userMutes)
      .set({ deletedAt: null, createdAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.userMutes.muterId, muterId),
          eq(schema.userMutes.mutedId, mutedId),
        ),
      )
      .run();
  } else {
    await db.insert(schema.userMutes).values({ muterId, mutedId }).run();
  }
}

export async function muteUser(
  db: Db,
  muterId: number,
  mutedId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  if (muterId === mutedId) {
    return { ok: false, error: 'Cannot mute yourself', code: 400 };
  }

  const target = await db
    .select({ id: schema.users.id, deletedAt: schema.users.deletedAt })
    .from(schema.users)
    .where(eq(schema.users.id, mutedId))
    .get();

  if (!target || target.deletedAt) {
    return { ok: false, error: 'User not found', code: 404 };
  }

  await upsertActiveMute(db, muterId, mutedId);
  return { ok: true };
}

export async function unmuteUser(
  db: Db,
  muterId: number,
  mutedId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const existing = await db
    .select()
    .from(schema.userMutes)
    .where(
      and(
        eq(schema.userMutes.muterId, muterId),
        eq(schema.userMutes.mutedId, mutedId),
        isNull(schema.userMutes.deletedAt),
      ),
    )
    .get();

  if (!existing) return { ok: true };

  await db
    .update(schema.userMutes)
    .set({ deletedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.userMutes.muterId, muterId),
        eq(schema.userMutes.mutedId, mutedId),
      ),
    )
    .run();

  return { ok: true };
}

export async function listMutedUsers(
  db: Db,
  userId: number,
  cursor: number | null,
  limit = LIST_PAGE_SIZE,
): Promise<{ users: MuteListUser[]; nextCursor: number | null }> {
  const conditions = [
    eq(schema.userMutes.muterId, userId),
    isNull(schema.userMutes.deletedAt),
    isNull(schema.users.deletedAt),
  ];
  if (cursor !== null) {
    conditions.push(lt(schema.userMutes.mutedId, cursor));
  }

  const rows = await db
    .select({
      mutedId: schema.userMutes.mutedId,
      createdAt: schema.userMutes.createdAt,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.userMutes)
    .innerJoin(schema.users, eq(schema.userMutes.mutedId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.userMutes.mutedId))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].mutedId : null;

  const users: MuteListUser[] = pageRows.map(r => ({
    id: r.mutedId,
    username: r.username,
    avatarUrl: r.avatarUrl ?? null,
    createdAt: r.createdAt,
  }));

  return { users, nextCursor };
}
