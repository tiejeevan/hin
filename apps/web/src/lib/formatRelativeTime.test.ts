import { describe, it, expect } from 'vitest';
import { formatLastSeen } from './formatRelativeTime';

describe('formatLastSeen', () => {
  const now = Date.parse('2026-08-02T12:00:00.000Z');

  it('formats recent times', () => {
    expect(formatLastSeen('2026-08-02T11:59:30.000Z', now)).toBe('just now');
    expect(formatLastSeen('2026-08-02T11:50:00.000Z', now)).toBe('10m ago');
    expect(formatLastSeen('2026-08-02T09:00:00.000Z', now)).toBe('3h ago');
  });

  it('formats calendar yesterday relative to local midnight', () => {
    const localNow = new Date(2026, 7, 2, 12, 0, 0); // Aug 2 local
    const yesterdayAfternoon = new Date(2026, 7, 1, 18, 0, 0);
    expect(formatLastSeen(yesterdayAfternoon.toISOString(), localNow.getTime())).toBe('yesterday');
  });
});
