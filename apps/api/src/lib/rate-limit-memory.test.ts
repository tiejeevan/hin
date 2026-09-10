import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRateLimiter, buildWsBucketKey } from './rate-limit-memory';

describe('MemoryRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T17:00:00.000Z'));
  });

  it('allows requests under the limit', () => {
    const limiter = new MemoryRateLimiter();
    const first = limiter.consume('k', 3, 60);
    const second = limiter.consume('k', 3, 60);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok) expect(first.remaining).toBe(2);
    if (second.ok) expect(second.remaining).toBe(1);
  });

  it('blocks when the limit is exceeded', () => {
    const limiter = new MemoryRateLimiter();
    limiter.consume('k', 2, 60);
    limiter.consume('k', 2, 60);
    const blocked = limiter.consume('k', 2, 60);

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('resets the window after expiry', () => {
    const limiter = new MemoryRateLimiter();
    limiter.consume('k', 1, 60);
    const blocked = limiter.consume('k', 1, 60);
    expect(blocked.ok).toBe(false);

    vi.advanceTimersByTime(61_000);
    const afterReset = limiter.consume('k', 1, 60);
    expect(afterReset.ok).toBe(true);
  });

  it('builds websocket bucket keys', () => {
    expect(buildWsBucketKey('send', 42)).toBe('ws:send:user:42');
    expect(buildWsBucketKey('typing', 7)).toBe('ws:typing:user:7');
  });
});
