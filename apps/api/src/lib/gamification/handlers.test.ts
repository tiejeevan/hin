import { describe, it, expect } from 'vitest';

/**
 * Pure logic mirrored from comment_created / comment_deleted handlers.
 * Counts represent active (non-deleted) comments after the primary write.
 */
function commentCreatedDeltas(activeCountOnPost: number): string[] {
  const deltas = ['total_comments'];
  if (activeCountOnPost === 1) deltas.push('unique_posts_commented');
  return deltas;
}

function commentDeletedDeltas(activeCountOnPost: number): string[] {
  const deltas = ['total_comments'];
  if (activeCountOnPost === 0) deltas.push('unique_posts_commented');
  return deltas;
}

describe('comment metric deltas', () => {
  it('comment_created increments total_comments always', () => {
    expect(commentCreatedDeltas(2)).toEqual(['total_comments']);
  });

  it('comment_created increments unique_posts_commented on first active comment', () => {
    expect(commentCreatedDeltas(1)).toEqual(['total_comments', 'unique_posts_commented']);
  });

  it('comment_deleted decrements total_comments always', () => {
    expect(commentDeletedDeltas(1)).toEqual(['total_comments']);
  });

  it('comment_deleted decrements unique_posts_commented when last active comment removed', () => {
    expect(commentDeletedDeltas(0)).toEqual(['total_comments', 'unique_posts_commented']);
  });
});
