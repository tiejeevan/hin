import { describe, expect, it } from 'vitest';
import { shouldShowModeratorBadge } from '@hin/types';

describe('shouldShowModeratorBadge', () => {
  it('shows for active moderators', () => {
    expect(shouldShowModeratorBadge('moderator', 'active')).toBe(true);
    expect(shouldShowModeratorBadge('moderator', null)).toBe(true);
    expect(shouldShowModeratorBadge('moderator', undefined)).toBe(true);
  });

  it('hides for suspended moderators', () => {
    expect(shouldShowModeratorBadge('moderator', 'suspended')).toBe(false);
  });

  it('hides for non-moderators', () => {
    expect(shouldShowModeratorBadge('user', 'active')).toBe(false);
    expect(shouldShowModeratorBadge('admin', null)).toBe(false);
  });
});
