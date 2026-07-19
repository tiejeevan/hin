import { describe, expect, it, vi, afterEach } from 'vitest';
import { isDisposableEmail } from './disposable';
import { getEmailChangeStatus, EMAIL_CHANGE_COOLDOWN_DAYS } from './change-cooldown';

describe('isDisposableEmail', () => {
  it('blocks known disposable domains', () => {
    expect(isDisposableEmail('user@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@temp-mail.org')).toBe(true);
    expect(isDisposableEmail('nested@sub.mailinator.com')).toBe(true);
  });

  it('allows common real providers', () => {
    expect(isDisposableEmail('person@gmail.com')).toBe(false);
    expect(isDisposableEmail('person@outlook.com')).toBe(false);
    expect(isDisposableEmail('person@company.co.uk')).toBe(false);
  });
});

describe('getEmailChangeStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows change when never verified', () => {
    expect(getEmailChangeStatus(null)).toEqual({
      canChangeEmail: true,
      nextChangeAt: null,
      daysRemaining: null,
    });
  });

  it('locks for 15 days after verification', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'));
    const verifiedAt = '2026-07-10T12:00:00.000Z';
    const status = getEmailChangeStatus(verifiedAt);
    expect(status.canChangeEmail).toBe(false);
    expect(status.daysRemaining).toBe(7);
    expect(status.nextChangeAt).toBe(
      new Date(Date.parse(verifiedAt) + EMAIL_CHANGE_COOLDOWN_DAYS * 86400000).toISOString(),
    );
  });

  it('allows change after cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
    expect(getEmailChangeStatus('2026-07-10T12:00:00.000Z').canChangeEmail).toBe(true);
  });
});
