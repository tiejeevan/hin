import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { drizzle } from 'drizzle-orm/d1';

type Db = ReturnType<typeof drizzle<typeof schema>>;
export type GamificationTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Concurrency-safe counter delta via composite PK + ON CONFLICT. */
export async function upsertCounterDelta(
  db: Db | GamificationTx,
  userId: number,
  metricKey: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;

  await db
    .insert(schema.userStatCounters)
    .values({ userId, metricKey, value: delta })
    .onConflictDoUpdate({
      target: [schema.userStatCounters.userId, schema.userStatCounters.metricKey],
      set: { value: sql`${schema.userStatCounters.value} + ${delta}` },
    })
    .run();
}

/** Set counter to an absolute value (used for peak metrics in v2+). */
export async function setCounterValue(
  db: Db | GamificationTx,
  userId: number,
  metricKey: string,
  value: number,
): Promise<void> {
  await db
    .insert(schema.userStatCounters)
    .values({ userId, metricKey, value })
    .onConflictDoUpdate({
      target: [schema.userStatCounters.userId, schema.userStatCounters.metricKey],
      set: { value },
    })
    .run();
}

export async function getCounterValue(
  db: Db | GamificationTx,
  userId: number,
  metricKey: string,
): Promise<number> {
  const row = await db
    .select({ value: schema.userStatCounters.value })
    .from(schema.userStatCounters)
    .where(
      and(
        eq(schema.userStatCounters.userId, userId),
        eq(schema.userStatCounters.metricKey, metricKey),
      ),
    )
    .get();
  return row?.value ?? 0;
}

export async function getUserCounters(
  db: Db | GamificationTx,
  userId: number,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      metricKey: schema.userStatCounters.metricKey,
      value: schema.userStatCounters.value,
    })
    .from(schema.userStatCounters)
    .where(eq(schema.userStatCounters.userId, userId))
    .all();

  const counters: Record<string, number> = {};
  for (const row of rows) {
    counters[row.metricKey] = row.value;
  }
  return counters;
}
