import { useState, useEffect } from 'react';
import { BarChart3, Clock, EyeOff, Users } from 'lucide-react';
import type { Poll, Post } from '@hin/types';

interface PostPollBodyProps {
  post: Post;
  poll: Poll;
  isAuthor: boolean;
  onVote: (postId: number, optionIds: number[]) => Promise<void>;
  onRetractVote: (postId: number) => Promise<void>;
  onClosePoll: (postId: number) => Promise<void>;
}

function formatTimeRemaining(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export function PostPollBody({
  post,
  poll,
  isAuthor,
  onVote,
  onRetractVote,
  onClosePoll,
}: PostPollBodyProps) {
  const [selected, setSelected] = useState<number[]>(poll.userVoteOptionIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(poll.userVoteOptionIds ?? []);
  }, [poll.userVoteOptionIds, poll.totalVotes, poll.status]);

  const isClosed = poll.status === 'closed' || poll.isExpired;
  const hasVoted = (poll.userVoteOptionIds?.length ?? 0) > 0;
  const isMulti = poll.maxSelections > 1;
  const canVote = !isClosed && !submitting;
  const showResults = poll.showResults;

  const toggleOption = (optionId: number) => {
    if (!canVote) return;
    if (isMulti) {
      setSelected(prev => {
        if (prev.includes(optionId)) return prev.filter(id => id !== optionId);
        if (prev.length >= poll.maxSelections) return prev;
        return [...prev, optionId];
      });
    } else {
      setSelected([optionId]);
      if (!hasVoted || poll.allowVoteChange) {
        void submitVote([optionId]);
      }
    }
  };

  const submitVote = async (optionIds: number[]) => {
    if (optionIds.length === 0) {
      setError('Select at least one option');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onVote(post.id, optionIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to vote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetract = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onRetractVote(post.id);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to retract vote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!confirm('Close this poll? Voting will stop and results may become visible.')) return;
    setSubmitting(true);
    setError(null);
    try {
      await onClosePoll(post.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close poll');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-primary leading-relaxed">{poll.question}</p>

      <div className="flex flex-wrap gap-1.5">
        {poll.isAnonymous && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted">
            <EyeOff className="h-3 w-3" />
            Anonymous
          </span>
        )}
        {isMulti && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
            <Users className="h-3 w-3" />
            Pick up to {poll.maxSelections}
          </span>
        )}
        {isClosed && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400">
            Closed
          </span>
        )}
      </div>

      <div className="space-y-2">
        {poll.options.map(option => {
          const isSelected =
            selected.includes(option.id) || (poll.userVoteOptionIds?.includes(option.id) ?? false);
          const displaySelected = hasVoted
            ? (poll.userVoteOptionIds?.includes(option.id) ?? false)
            : isSelected;

          return (
            <button
              key={option.id}
              type="button"
              disabled={!canVote && !showResults}
              onClick={() => toggleOption(option.id)}
              className={`w-full text-left relative overflow-hidden rounded-xl border transition-all cursor-pointer min-h-[44px] ${
                displaySelected
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-border-custom hover:border-indigo-500/50 bg-bg-primary/50'
              } ${!canVote && !showResults ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {showResults && poll.totalVotes > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-500/15 transition-all duration-500"
                  style={{ width: `${option.votePercent ?? 0}%` }}
                />
              )}
              <div className="relative flex items-center justify-between px-3 py-2.5 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isMulti && (
                    <span
                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                        displaySelected ? 'border-indigo-500 bg-indigo-500' : 'border-border-custom'
                      }`}
                    >
                      {displaySelected && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className="text-sm text-text-primary truncate">{option.label}</span>
                </div>
                {showResults && (
                  <span className="text-xs text-text-muted shrink-0 tabular-nums">
                    {option.votePercent ?? 0}% ({option.voteCount})
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {isMulti && canVote && (
          <button
            type="button"
            disabled={selected.length === 0 || submitting}
            onClick={() => submitVote(selected)}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer min-h-[44px]"
          >
            {submitting ? 'Submitting…' : hasVoted ? 'Update vote' : 'Vote'}
          </button>
        )}
        {hasVoted && poll.allowVoteRetraction && !isClosed && (
          <button
            type="button"
            disabled={submitting}
            onClick={handleRetract}
            className="text-xs text-text-muted hover:text-rose-400 px-3 py-2 rounded-xl cursor-pointer min-h-[44px]"
          >
            Remove vote
          </button>
        )}
        {isAuthor && !isClosed && (
          <button
            type="button"
            disabled={submitting}
            onClick={handleClose}
            className="text-xs text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-xl cursor-pointer min-h-[44px]"
          >
            Close poll
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <BarChart3 className="h-3 w-3" />
          {showResults ? `${poll.totalVotes} vote${poll.totalVotes !== 1 ? 's' : ''}` : 'Results hidden'}
        </span>
        {poll.endsAt && !isClosed && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTimeRemaining(poll.endsAt)}
          </span>
        )}
        {isClosed && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Poll closed
          </span>
        )}
      </div>
    </div>
  );
}
