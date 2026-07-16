import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray, and, isNull, count } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { OlabidItemSnapshot } from '@hin/types';
import type { OlabidItem } from './olabidApi';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Persist (or refresh) a local snapshot of a live Olabid item so discussion + a fallback view survive after the auction ends. */
export async function upsertOlabidItemSnapshot(db: Db, item: OlabidItem): Promise<void> {
  const imageUrl = item.images?.[0]?.largeUrl || item.images?.[0]?.url || null;
  const values = {
    externalId: item.id,
    name: item.name,
    sku: item.sku ?? null,
    condition: item.condition ?? null,
    currentBidAmount: item.currentBidAmount ?? null,
    retailPrice: item.retailPrice ?? null,
    imageUrl,
    snapshotJson: JSON.stringify(item),
    lastSyncedAt: new Date().toISOString(),
  };

  await db
    .insert(schema.olabidItems)
    .values(values)
    .onConflictDoUpdate({
      target: schema.olabidItems.externalId,
      set: {
        name: values.name,
        sku: values.sku,
        condition: values.condition,
        currentBidAmount: values.currentBidAmount,
        retailPrice: values.retailPrice,
        imageUrl: values.imageUrl,
        snapshotJson: values.snapshotJson,
        lastSyncedAt: values.lastSyncedAt,
      },
    })
    .run();
}

export function toOlabidItemSnapshotDTO(row: typeof schema.olabidItems.$inferSelect): OlabidItemSnapshot {
  return {
    externalId: row.externalId,
    name: row.name,
    sku: row.sku,
    condition: row.condition,
    currentBidAmount: row.currentBidAmount,
    retailPrice: row.retailPrice,
    imageUrl: row.imageUrl,
    lastSyncedAt: row.lastSyncedAt,
  };
}

export async function getOlabidItemSnapshot(db: Db, externalId: number): Promise<OlabidItemSnapshot | null> {
  const row = await db.select().from(schema.olabidItems).where(eq(schema.olabidItems.externalId, externalId)).get();
  return row ? toOlabidItemSnapshotDTO(row) : null;
}

/** Ensure a minimal olabid_items row exists so a comment's foreign key is satisfied even if the item was never fetched live. */
export async function ensureOlabidItemStub(db: Db, externalId: number): Promise<void> {
  const existing = await db.select({ externalId: schema.olabidItems.externalId }).from(schema.olabidItems).where(eq(schema.olabidItems.externalId, externalId)).get();
  if (existing) return;
  await db.insert(schema.olabidItems).values({
    externalId,
    name: `Olabid item #${externalId}`,
  }).onConflictDoNothing().run();
}

/** Batch comment counts for a set of Olabid item ids, e.g. for badges on the listing grid. */
export async function getItemCommentCounts(db: Db, externalIds: number[]): Promise<Record<number, number>> {
  if (externalIds.length === 0) return {};
  const rows = await db
    .select({ olabidItemId: schema.itemComments.olabidItemId, value: count() })
    .from(schema.itemComments)
    .where(and(inArray(schema.itemComments.olabidItemId, externalIds), isNull(schema.itemComments.deletedAt)))
    .groupBy(schema.itemComments.olabidItemId)
    .all();

  const result: Record<number, number> = {};
  for (const id of externalIds) result[id] = 0;
  for (const row of rows) result[row.olabidItemId] = row.value;
  return result;
}
