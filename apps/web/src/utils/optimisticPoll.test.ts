import { describe, expect, it } from 'vitest';
import type { Poll } from '@hin/types';
import { computeOptimisticPoll } from '../utils/optimisticPoll';

const basePoll = (): Poll => ({
  id: 1,
  postId: 10,
  question: 'Pick one',
  endsAt: null,
  maxSelections: 1,
  allowVoteChange: true,
  allowVoteRetraction: true,
  isAnonymous: false,
  resultsVisibility: 'always',
  status: 'open',
  totalVotes: 2,
  options: [
    { id: 1, position: 0, label: 'A', voteCount: 1, votePercent: 50 },
    { id: 2, position: 1, label: 'B', voteCount: 1, votePercent: 50 },
  ],
  userVoteOptionIds: [],
  showResults: true,
  isExpired: false,
});

describe('computeOptimisticPoll', () => {
  it('increments counts when voting', () => {
    const next = computeOptimisticPoll(basePoll(), [1], 'vote', false);
    expect(next.userVoteOptionIds).toEqual([1]);
    expect(next.totalVotes).toBe(3);
    expect(next.options.find(o => o.id === 1)?.voteCount).toBe(2);
    expect(next.options.find(o => o.id === 2)?.voteCount).toBe(1);
  });

  it('decrements counts when retracting', () => {
    const voted: Poll = {
      ...basePoll(),
      totalVotes: 3,
      userVoteOptionIds: [1],
      options: [
        { id: 1, position: 0, label: 'A', voteCount: 2, votePercent: 67 },
        { id: 2, position: 1, label: 'B', voteCount: 1, votePercent: 33 },
      ],
    };
    const next = computeOptimisticPoll(voted, [], 'retract', false);
    expect(next.userVoteOptionIds).toEqual([]);
    expect(next.totalVotes).toBe(2);
    expect(next.options.find(o => o.id === 1)?.voteCount).toBe(1);
  });

  it('switches vote between options', () => {
    const voted: Poll = {
      ...basePoll(),
      totalVotes: 3,
      userVoteOptionIds: [1],
      options: [
        { id: 1, position: 0, label: 'A', voteCount: 2, votePercent: 67 },
        { id: 2, position: 1, label: 'B', voteCount: 1, votePercent: 33 },
      ],
    };
    const next = computeOptimisticPoll(voted, [2], 'vote', false);
    expect(next.userVoteOptionIds).toEqual([2]);
    expect(next.totalVotes).toBe(3);
    expect(next.options.find(o => o.id === 1)?.voteCount).toBe(1);
    expect(next.options.find(o => o.id === 2)?.voteCount).toBe(2);
  });
});
