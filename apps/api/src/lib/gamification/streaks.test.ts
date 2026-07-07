import { describe, it, expect } from 'vitest';
import {
  calendarDayUTC,
  daysBetweenUTC,
  computeLoginStreakUpdate,
} from './streaks';

describe('calendarDayUTC', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(calendarDayUTC(new Date('2026-03-15T23:30:00Z'))).toBe('2026-03-15');
    expect(calendarDayUTC(new Date('2026-03-16T01:00:00Z'))).toBe('2026-03-16');
  });
});

describe('daysBetweenUTC', () => {
  it('counts whole calendar days', () => {
    expect(daysBetweenUTC('2026-03-01', '2026-03-02')).toBe(1);
    expect(daysBetweenUTC('2026-03-01', '2026-03-08')).toBe(7);
  });
});

describe('computeLoginStreakUpdate', () => {
  const today = '2026-03-08';

  it('starts streak at 1 on first visit', () => {
    const result = computeLoginStreakUpdate(null, 0, 0, today);
    expect(result).toEqual({ newCurrent: 1, newLongest: 1, updated: true });
  });

  it('does not double-count same calendar day', () => {
    const result = computeLoginStreakUpdate(today, 5, 5, today);
    expect(result).toEqual({ newCurrent: 5, newLongest: 5, updated: false });
  });

  it('increments on consecutive day', () => {
    const result = computeLoginStreakUpdate('2026-03-07', 6, 6, today);
    expect(result).toEqual({ newCurrent: 7, newLongest: 7, updated: true });
  });

  it('resets to 1 when gap > 1 day', () => {
    const result = computeLoginStreakUpdate('2026-03-05', 10, 10, today);
    expect(result).toEqual({ newCurrent: 1, newLongest: 10, updated: true });
  });
});
