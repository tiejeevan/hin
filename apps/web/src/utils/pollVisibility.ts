import type { Poll, PollResultsVisibility, PollStatus } from '@hin/types';

export function computePollShowResults(
  resultsVisibility: PollResultsVisibility,
  status: PollStatus,
  isExpired: boolean,
  userVoteOptionIds: number[],
  isAuthor: boolean,
): boolean {
  const isClosed = status === 'closed' || isExpired;
  const hasVoted = userVoteOptionIds.length > 0;
  switch (resultsVisibility) {
    case 'always':
      return true;
    case 'after_vote':
      return hasVoted || isAuthor;
    case 'after_close':
      return isClosed || isAuthor;
    default:
      return true;
  }
}

/** Merge incoming poll aggregate data from realtime, preserving viewer-specific state. */
export function mergePollFromBroadcast(
  existing: Poll,
  incoming: Poll,
  isAuthor: boolean,
): Poll {
  const userVoteOptionIds = existing.userVoteOptionIds ?? [];
  const showResults = computePollShowResults(
    existing.resultsVisibility,
    incoming.status,
    incoming.isExpired,
    userVoteOptionIds,
    isAuthor,
  );
  const totalVotes = showResults ? incoming.totalVotes : 0;
  const options = existing.options.map(opt => {
    const updated = incoming.options.find(o => o.id === opt.id);
    if (!updated) return opt;
    return {
      ...opt,
      voteCount: showResults ? updated.voteCount : 0,
      votePercent: showResults ? updated.votePercent : undefined,
    };
  });
  return {
    ...existing,
    status: incoming.status,
    isExpired: incoming.isExpired,
    endsAt: incoming.endsAt,
    showResults,
    totalVotes,
    options,
  };
}
