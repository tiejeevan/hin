import { eq } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@hin/db';

type Db = DrizzleD1Database<typeof schema>;

export const INTRO_WALKTHROUGH_VERSION = 1;

export async function isIntroWalkthroughCompleted(
  db: Db,
  userId: number,
  version = INTRO_WALKTHROUGH_VERSION,
): Promise<boolean> {
  const row = await db.select({
    version: schema.introWalkthrough.version,
  })
    .from(schema.introWalkthrough)
    .where(eq(schema.introWalkthrough.userId, userId))
    .get();

  return !!row && row.version >= version;
}

export async function completeIntroWalkthrough(
  db: Db,
  userId: number,
  version = INTRO_WALKTHROUGH_VERSION,
): Promise<void> {
  const completedAt = new Date().toISOString();

  await db.insert(schema.introWalkthrough)
    .values({ userId, completedAt, version })
    .onConflictDoUpdate({
      target: schema.introWalkthrough.userId,
      set: { completedAt, version },
    });
}
