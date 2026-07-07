import { describe, it, expect } from 'vitest';
import {
  DAILY_POINT_CAP,
  DAILY_SESSION_MINUTES_CAP,
  SESSION_TICK_MIN_INTERVAL_SEC,
  isInternalCounterKey,
} from './abuse';

describe('abuse constants', () => {
  it('daily point cap is positive', () => {
    expect(DAILY_POINT_CAP).toBeGreaterThan(0);
  });

  it('daily session minutes cap exceeds one tick', () => {
    expect(DAILY_SESSION_MINUTES_CAP).toBeGreaterThanOrEqual(5);
  });

  it('session tick interval is under 5 minutes', () => {
    expect(SESSION_TICK_MIN_INTERVAL_SEC).toBeLessThanOrEqual(300);
  });
});

describe('isInternalCounterKey', () => {
  it('flags internal bucket keys', () => {
    expect(isInternalCounterKey('__daily_points:2026-07-07')).toBe(true);
    expect(isInternalCounterKey('total_posts')).toBe(false);
  });
});
