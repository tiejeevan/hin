import { describe, expect, it } from 'vitest';
import {
  getAccountBlockMessage,
  getAccountBlockReason,
  isAccountSetupComplete,
  userNeedsEmailVerification,
} from './account-guard';

describe('userNeedsEmailVerification', () => {
  it('requires verification for password users with unverified email', () => {
    expect(userNeedsEmailVerification({
      passwordHash: 'hash',
      email: 'user@example.com',
      emailVerifiedAt: null,
    })).toBe(true);
  });

  it('does not require verification for legacy password users without email', () => {
    expect(userNeedsEmailVerification({
      passwordHash: 'hash',
      email: null,
      emailVerifiedAt: null,
    })).toBe(false);
  });

  it('does not require verification once email is verified', () => {
    expect(userNeedsEmailVerification({
      passwordHash: 'hash',
      email: 'user@example.com',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(false);
  });

  it('does not require verification for Google-only accounts', () => {
    expect(userNeedsEmailVerification({
      passwordHash: '',
      googleId: 'google-123',
      email: 'user@example.com',
      emailVerifiedAt: null,
    })).toBe(false);
  });

  it('does not require verification when platform flag is disabled', () => {
    expect(userNeedsEmailVerification({
      passwordHash: 'hash',
      email: 'user@example.com',
      emailVerifiedAt: null,
    }, { emailVerificationRequired: false })).toBe(false);
  });
});

describe('getAccountBlockMessage', () => {
  it('returns user-facing messages for each block reason', () => {
    expect(getAccountBlockMessage('username_setup_required')).toBe('Choose a username to continue');
    expect(getAccountBlockMessage('email_verification_required')).toBe('Verify your email to continue');
  });
});

describe('getAccountBlockReason', () => {
  it('returns null for legacy macp-style accounts', () => {
    expect(getAccountBlockReason({
      passwordHash: 'hash',
      email: null,
      emailVerifiedAt: null,
      needsUsernameSetup: 0,
    })).toBeNull();
    expect(isAccountSetupComplete({
      passwordHash: 'hash',
      email: null,
      emailVerifiedAt: null,
      needsUsernameSetup: 0,
    })).toBe(true);
  });

  it('returns null for unverified password users when platform flag is disabled', () => {
    expect(getAccountBlockReason({
      passwordHash: 'hash',
      email: 'user@example.com',
      emailVerifiedAt: null,
      needsUsernameSetup: 0,
    }, { emailVerificationRequired: false })).toBeNull();
  });

  it('still returns username_setup_required when email verification is disabled', () => {
    expect(getAccountBlockReason({
      needsUsernameSetup: 1,
      passwordHash: 'hash',
      email: 'user@example.com',
      emailVerifiedAt: null,
    }, { emailVerificationRequired: false })).toBe('username_setup_required');
  });
});
