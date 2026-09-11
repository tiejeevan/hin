import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { resolveClientIp } from './rate-limit-policy';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window counter in D1. Key should encode action + subject + window bucket
 * (e.g. `otp_send:ip:1.2.3.4:2026071817`) OR use a rolling window via windowEndsAt.
 *
 * This helper uses a rolling window: first hit sets windowEndsAt = now + windowSeconds.
 */
export async function consumeRateLimit(
  db: Db,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    return await consumeRateLimitInner(db, bucketKey, limit, windowSeconds);
  } catch (e) {
    console.error('Rate limit check failed (fail-open):', e);
    return { ok: true, remaining: limit };
  }
}

async function consumeRateLimitInner(
  db: Db,
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const existing = await db.select()
    .from(schema.rateLimitBuckets)
    .where(eq(schema.rateLimitBuckets.bucketKey, bucketKey))
    .get();

  if (!existing || existing.windowEndsAt <= nowIso) {
    const windowEndsAt = new Date(now + windowSeconds * 1000).toISOString();
    await db.insert(schema.rateLimitBuckets)
      .values({ bucketKey, count: 1, windowEndsAt })
      .onConflictDoUpdate({
        target: schema.rateLimitBuckets.bucketKey,
        set: { count: 1, windowEndsAt },
      })
      .run();
    return { ok: true, remaining: Math.max(0, limit - 1) };
  }

  if (existing.count >= limit) {
    const endsMs = Date.parse(existing.windowEndsAt);
    const retryAfterSeconds = Number.isFinite(endsMs)
      ? Math.max(1, Math.ceil((endsMs - now) / 1000))
      : windowSeconds;
    return { ok: false, retryAfterSeconds };
  }

  await db.update(schema.rateLimitBuckets)
    .set({ count: sql`${schema.rateLimitBuckets.count} + 1` })
    .where(eq(schema.rateLimitBuckets.bucketKey, bucketKey))
    .run();

  return { ok: true, remaining: Math.max(0, limit - existing.count - 1) };
}

/** Decrement a rate-limit bucket after a failed register attempt (refund one consumed slot). */
export async function refundRateLimit(
  db: Db,
  bucketKey: string,
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const existing = await db.select()
      .from(schema.rateLimitBuckets)
      .where(eq(schema.rateLimitBuckets.bucketKey, bucketKey))
      .get();

    if (!existing || existing.windowEndsAt <= nowIso || existing.count <= 0) {
      return;
    }

    await db.update(schema.rateLimitBuckets)
      .set({ count: existing.count - 1 })
      .where(eq(schema.rateLimitBuckets.bucketKey, bucketKey))
      .run();
  } catch (e) {
    console.error('Rate limit refund failed (ignored):', e);
  }
}

export function clientIpFromRequest(req: Request): string | null {
  const ip = resolveClientIp(req);
  return ip === 'unknown' ? null : ip;
}
