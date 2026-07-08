import { eq, and, inArray, asc } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { EquippedBadgePublic } from '@hin/types';
import type { drizzle } from 'drizzle-orm/d1';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Admins may equip unlimited badges — `null` signals "no cap" to clients. */
export async function getMaxEquippedBadges(db: Db, level: number, role: string): Promise<number | null> {
  if (role === 'admin') return null;

  const entry = await db
    .select({ maxEquippedBadges: schema.levelConfig.maxEquippedBadges })
    .from(schema.levelConfig)
    .where(eq(schema.levelConfig.level, level))
    .get();

  return entry?.maxEquippedBadges ?? 0;
}

export async function getEquippedBadgesForUser(db: Db, userId: number): Promise<EquippedBadgePublic[]> {
  const rows = await db
    .select({
      id: schema.badges.id,
      name: schema.badges.name,
      imageUrl: schema.badges.imageUrl,
    })
    .from(schema.userEquippedBadges)
    .innerJoin(schema.badges, eq(schema.userEquippedBadges.badgeId, schema.badges.id))
    .where(eq(schema.userEquippedBadges.userId, userId))
    .orderBy(asc(schema.userEquippedBadges.sortOrder))
    .all();

  return rows;
}

/** Batch-loads equipped badges for many users at once — for feeds, comments, threads. */
export async function loadEquippedBadgesForUsers(
  db: Db,
  userIds: number[],
): Promise<Map<number, EquippedBadgePublic[]>> {
  const result = new Map<number, EquippedBadgePublic[]>();
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return result;

  const rows = await db
    .select({
      userId: schema.userEquippedBadges.userId,
      sortOrder: schema.userEquippedBadges.sortOrder,
      id: schema.badges.id,
      name: schema.badges.name,
      imageUrl: schema.badges.imageUrl,
    })
    .from(schema.userEquippedBadges)
    .innerJoin(schema.badges, eq(schema.userEquippedBadges.badgeId, schema.badges.id))
    .where(inArray(schema.userEquippedBadges.userId, uniqueIds))
    .orderBy(asc(schema.userEquippedBadges.sortOrder))
    .all();

  for (const row of rows) {
    const list = result.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name, imageUrl: row.imageUrl });
    result.set(row.userId, list);
  }

  return result;
}

export type SetEquippedBadgesResult =
  | { success: true; equippedBadges: EquippedBadgePublic[] }
  | { success: false; error: string };

export async function setEquippedBadges(
  db: Db,
  userId: number,
  badgeIds: number[],
  opts: { role: string; level: number },
): Promise<SetEquippedBadgesResult> {
  const dedupedIds = [...new Set(badgeIds)];

  if (opts.role !== 'admin') {
    const max = await getMaxEquippedBadges(db, opts.level, opts.role);
    if (max !== null && dedupedIds.length > max) {
      return { success: false, error: `You can equip at most ${max} badge${max === 1 ? '' : 's'} at your level.` };
    }
  }

  if (dedupedIds.length > 0) {
    const owned = await db
      .select({ badgeId: schema.userBadges.badgeId })
      .from(schema.userBadges)
      .where(
        and(
          eq(schema.userBadges.userId, userId),
          inArray(schema.userBadges.badgeId, dedupedIds),
        ),
      )
      .all();

    const ownedSet = new Set(owned.map((r) => r.badgeId));
    const notOwned = dedupedIds.filter((id) => !ownedSet.has(id));
    if (notOwned.length > 0) {
      return { success: false, error: 'You can only equip badges you have earned.' };
    }
  }

  await db.delete(schema.userEquippedBadges).where(eq(schema.userEquippedBadges.userId, userId)).run();

  if (dedupedIds.length > 0) {
    await db
      .insert(schema.userEquippedBadges)
      .values(dedupedIds.map((badgeId, index) => ({ userId, badgeId, sortOrder: index })))
      .run();
  }

  const equippedBadges = await getEquippedBadgesForUser(db, userId);
  return { success: true, equippedBadges };
}

/** Removes a badge from every user's equipped set — used when a badge is revoked or deleted. */
export async function unequipBadgeForAllUsers(db: Db, badgeId: number): Promise<void> {
  await db.delete(schema.userEquippedBadges).where(eq(schema.userEquippedBadges.badgeId, badgeId)).run();
}

/** Removes a single user's equipped entry for a badge — used when an admin revokes it from them. */
export async function unequipBadgeForUser(db: Db, userId: number, badgeId: number): Promise<void> {
  await db
    .delete(schema.userEquippedBadges)
    .where(
      and(
        eq(schema.userEquippedBadges.userId, userId),
        eq(schema.userEquippedBadges.badgeId, badgeId),
      ),
    )
    .run();
}
