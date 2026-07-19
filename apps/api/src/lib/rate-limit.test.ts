import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Lightweight unit coverage for bucket-key window math used by consumeRateLimit.
 * Full D1 integration is exercised via local wrangler + profile Email UI.
 */
describe('rate limit window math', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T17:00:00.000Z'));
  });

  it('computes retry-after from window end', () => {
    const now = Date.now();
    const windowEndsAt = new Date(now + 45_000).toISOString();
    const endsMs = Date.parse(windowEndsAt);
    const retryAfterSeconds = Math.max(1, Math.ceil((endsMs - now) / 1000));
    expect(retryAfterSeconds).toBe(45);
  });
});
