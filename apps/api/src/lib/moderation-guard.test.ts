import { describe, expect, it } from 'vitest';
import {
  canActOnTarget,
  getAccountModerationBlockReason,
  isAccountRestricted,
  isSuspensionExpired,
} from './moderation-guard';

describe('getAccountModerationBlockReason', () => {
  it('blocks banned users', () => {
    expect(getAccountModerationBlockReason({ accountModerationStatus: 'banned' })).toBe('banned');
  });

  it('blocks active suspensions', () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    expect(
      getAccountModerationBlockReason({ accountModerationStatus: 'suspended', accountModerationUntil: until }),
    ).toBe('suspended');
  });

  it('ignores expired suspensions', () => {
    const until = new Date(Date.now() - 60_000).toISOString();
    expect(
      getAccountModerationBlockReason({ accountModerationStatus: 'suspended', accountModerationUntil: until }),
    ).toBeNull();
  });
});

describe('isAccountRestricted', () => {
  it('detects restricted status', () => {
    expect(isAccountRestricted({ accountModerationStatus: 'restricted' })).toBe(true);
    expect(isAccountRestricted({ accountModerationStatus: 'active' })).toBe(false);
  });
});

describe('isSuspensionExpired', () => {
  it('returns false when until is null', () => {
    expect(isSuspensionExpired(null)).toBe(false);
  });
});

describe('canActOnTarget', () => {
  it('prevents self-moderation', () => {
    expect(canActOnTarget('admin', 'user', 1, 1)).toBe(false);
  });

  it('allows admin on moderators and users', () => {
    expect(canActOnTarget('admin', 'moderator', 1, 2)).toBe(true);
    expect(canActOnTarget('admin', 'user', 1, 2)).toBe(true);
  });

  it('blocks acting on admins', () => {
    expect(canActOnTarget('admin', 'admin', 1, 2)).toBe(false);
  });

  it('allows moderators only on users', () => {
    expect(canActOnTarget('moderator', 'user', 1, 2)).toBe(true);
    expect(canActOnTarget('moderator', 'moderator', 1, 2)).toBe(false);
  });
});
