import { describe, it, expect } from 'vitest';

/** Fisher-Yates slice logic mirrored from finalizeRaffleForEvent. */
function pickRaffleWinners<T extends { userId: number; score: number }>(
  participants: T[],
  winnerCount: number,
  random: () => number,
): T[] {
  const eligible = participants.filter((p) => p.score > 0);
  if (eligible.length === 0) return [];

  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.max(1, winnerCount));
}

describe('raffle winner selection', () => {
  const participants = [
    { userId: 1, score: 10 },
    { userId: 2, score: 5 },
    { userId: 3, score: 0 },
    { userId: 4, score: 2 },
  ];

  it('excludes zero-score participants', () => {
    const winners = pickRaffleWinners(participants, 2, () => 0.5);
    expect(winners.every((w) => w.score > 0)).toBe(true);
    expect(winners).toHaveLength(2);
  });

  it('returns empty when no eligible participants', () => {
    expect(pickRaffleWinners([{ userId: 1, score: 0 }], 1, () => 0)).toEqual([]);
  });

  it('picks at least one winner when eligible exist', () => {
    const winners = pickRaffleWinners(participants, 1, () => 0);
    expect(winners).toHaveLength(1);
    expect(winners[0].score).toBeGreaterThan(0);
  });
});
