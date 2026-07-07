/** UTC calendar day as YYYY-MM-DD. */
export function calendarDayUTC(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days between two UTC calendar dates (b - a). */
export function daysBetweenUTC(a: string, b: string): number {
  const start = Date.parse(`${a}T00:00:00.000Z`);
  const end = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export interface LoginStreakUpdate {
  newCurrent: number;
  newLongest: number;
  updated: boolean;
}

/**
 * Idempotent calendar-day login streak logic.
 * Same-day visits do not increment; gap > 1 day resets to 1.
 */
export function computeLoginStreakUpdate(
  lastActivityDate: string | null | undefined,
  currentStreak: number,
  longestStreak: number,
  today: string,
): LoginStreakUpdate {
  if (lastActivityDate === today) {
    return { newCurrent: currentStreak, newLongest: longestStreak, updated: false };
  }

  let newCurrent: number;
  if (!lastActivityDate) {
    newCurrent = 1;
  } else {
    const gap = daysBetweenUTC(lastActivityDate, today);
    newCurrent = gap === 1 ? currentStreak + 1 : 1;
  }

  return {
    newCurrent,
    newLongest: Math.max(longestStreak, newCurrent),
    updated: true,
  };
}
