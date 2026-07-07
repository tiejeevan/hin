import { lte, inArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { drizzle } from 'drizzle-orm/d1';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const LEDGER_RETENTION_DAYS = 90;
const ARCHIVE_BATCH_SIZE = 500;

let lastArchiveRun: number | null = null;
const ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function retentionCutoffIso(): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - LEDGER_RETENTION_DAYS);
  return cutoff.toISOString();
}

/**
 * Move points_ledger rows older than 90 days to points_ledger_archive.
 * Totals in user_gamification are unchanged — archival is audit-only.
 */
export async function archiveOldLedgerRows(db: Db): Promise<number> {
  const cutoff = retentionCutoffIso();
  let totalArchived = 0;

  for (;;) {
    const rows = await db
      .select()
      .from(schema.pointsLedger)
      .where(lte(schema.pointsLedger.createdAt, cutoff))
      .limit(ARCHIVE_BATCH_SIZE)
      .all();

    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    const now = new Date().toISOString();

    for (const row of rows) {
      await db.insert(schema.pointsLedgerArchive).values({
        id: row.id,
        userId: row.userId,
        actionType: row.actionType,
        delta: row.delta,
        metadata: row.metadata,
        createdAt: row.createdAt,
        archivedAt: now,
      }).onConflictDoNothing().run();
    }

    await db
      .delete(schema.pointsLedger)
      .where(inArray(schema.pointsLedger.id, ids))
      .run();

    totalArchived += rows.length;
    if (rows.length < ARCHIVE_BATCH_SIZE) break;
  }

  return totalArchived;
}

/** Run archival at most once per day (Worker memory TTL). */
export async function maybeArchiveLedger(db: Db): Promise<void> {
  const now = Date.now();
  if (lastArchiveRun && now - lastArchiveRun < ARCHIVE_INTERVAL_MS) return;
  lastArchiveRun = now;
  try {
    await archiveOldLedgerRows(db);
  } catch (err) {
    console.error('ledger archival failed', err);
    lastArchiveRun = null;
  }
}

export function resetArchiveCacheForTests(): void {
  lastArchiveRun = null;
}
