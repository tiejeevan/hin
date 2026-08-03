import type { Poll } from '@hin/types';
import { computePollShowResults } from './pollVisibility';

/**
 * Locally recompute poll option counts / percents for optimistic vote or retract.
 * Server response remains authoritative and replaces this on success.
 */
export function computeOptimisticPoll(
  poll: Poll,
  optionIds: number[],
  mode: 'vote' | 'retract',
  isAuthor: boolean,
): Poll {
  const prevVotes = new Set(poll.userVoteOptionIds ?? []);
  const nextVotes =
    mode === 'retract' ? new Set<number>() : new Set(optionIds);

  const options = poll.options.map(opt => {
    let voteCount = opt.voteCount;
    const wasVoted = prevVotes.has(opt.id);
    const willVote = nextVotes.has(opt.id);
    if (wasVoted && !willVote) voteCount = Math.max(0, voteCount - 1);
    if (!wasVoted && willVote) voteCount = voteCount + 1;
    return { ...opt, voteCount };
  });

  // totalVotes tracks ballots (voters), not option ticks — approximate for multi-select
  let totalVotes = poll.totalVotes;
  const hadBallot = prevVotes.size > 0;
  const hasBallot = nextVotes.size > 0;
  if (!hadBallot && hasBallot) totalVotes += 1;
  if (hadBallot && !hasBallot) totalVotes = Math.max(0, totalVotes - 1);

  const userVoteOptionIds = [...nextVotes];
  const showResults = computePollShowResults(
    poll.resultsVisibility,
    poll.status,
    poll.isExpired,
    userVoteOptionIds,
    isAuthor,
  );

  const withPercents = options.map(opt => ({
    ...opt,
    votePercent:
      totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0,
  }));

  return {
    ...poll,
    userVoteOptionIds,
    totalVotes: showResults ? totalVotes : 0,
    showResults,
    options: withPercents.map(opt =>
      showResults
        ? opt
        : { ...opt, voteCount: 0, votePercent: undefined },
    ),
  };
}
