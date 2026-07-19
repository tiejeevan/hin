import { describe, expect, it } from 'vitest';
import {
  OTP_LENGTH,
  OTP_RESET_LENGTH,
  OTP_PURPOSE_PASSWORD_RESET,
  generateOtpCode,
  hashOtpCode,
  codesMatch,
} from './otp';
import { notificationDeepLink, pushCopyForNotification } from './push';
import type { Notification } from '@hin/types';

describe('otp password reset helpers', () => {
  it('generates 4-digit verify codes and 6-digit reset codes', () => {
    expect(generateOtpCode(OTP_LENGTH)).toMatch(/^\d{4}$/);
    expect(generateOtpCode(OTP_RESET_LENGTH)).toMatch(/^\d{6}$/);
  });

  it('hashes and matches codes with pepper', async () => {
    const code = '123456';
    const hash = await hashOtpCode(code, 'test-pepper');
    expect(await codesMatch(code, hash, 'test-pepper')).toBe(true);
    expect(await codesMatch('000000', hash, 'test-pepper')).toBe(false);
  });

  it('exports password_reset purpose', () => {
    expect(OTP_PURPOSE_PASSWORD_RESET).toBe('password_reset');
  });
});

describe('push helpers', () => {
  it('builds deep links from notification types', () => {
    expect(notificationDeepLink({ type: 'follow', senderId: 9 })).toBe('/profile/9');
    expect(notificationDeepLink({ type: 'comment', entityId: 42 })).toBe('/posts/42');
    expect(notificationDeepLink({ type: 'system' })).toBe('/');
  });

  it('builds push copy', () => {
    const n: Notification = {
      id: 1,
      userId: 2,
      senderId: 3,
      senderUsername: 'alice',
      type: 'comment',
      entityType: 'post',
      entityId: 10,
      commentId: null,
      content: 'alice commented',
      read: false,
      createdAt: new Date().toISOString(),
    };
    const copy = pushCopyForNotification(n);
    expect(copy.title).toBe('New comment');
    expect(copy.body).toBe('alice commented');
    expect(copy.url).toBe('/posts/10');
    expect(copy.notificationId).toBe(1);
  });
});
