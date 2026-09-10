import type { RateLimitResult } from './rate-limit';

type BucketState = {
  count: number;
  windowEndsAtMs: number;
};

/** Rolling-window counter for Durable Objects (no D1). */
export class MemoryRateLimiter {
  private buckets = new Map<string, BucketState>();

  consume(key: string, limit: number, windowSec: number, nowMs: number = Date.now()): RateLimitResult {
    const existing = this.buckets.get(key);
    const windowMs = windowSec * 1000;

    if (!existing || existing.windowEndsAtMs <= nowMs) {
      const windowEndsAtMs = nowMs + windowMs;
      this.buckets.set(key, { count: 1, windowEndsAtMs });
      return { ok: true, remaining: Math.max(0, limit - 1) };
    }

    if (existing.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.windowEndsAtMs - nowMs) / 1000));
      return { ok: false, retryAfterSeconds };
    }

    existing.count += 1;
    return { ok: true, remaining: Math.max(0, limit - existing.count) };
  }

  /** Test helper — clear all buckets. */
  reset(): void {
    this.buckets.clear();
  }
}

export function buildWsBucketKey(action: 'send' | 'typing', userId: number): string {
  return `ws:${action}:user:${userId}`;
}
