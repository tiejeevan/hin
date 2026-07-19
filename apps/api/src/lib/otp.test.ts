import { describe, expect, it } from 'vitest';
import {
  codesMatch,
  generateOtpCode,
  hashOtpCode,
  isValidEmail,
  maskEmail,
  normalizeEmail,
} from './otp';

describe('otp helpers', () => {
  it('normalizes and validates emails', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(isValidEmail('foo@bar.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });

  it('masks emails', () => {
    expect(maskEmail('ab@example.com')).toBe('ab*@example.com');
    expect(maskEmail('hello@example.com')).toBe('he***@example.com');
  });

  it('generates 4-digit codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it('hashes and compares codes with pepper', async () => {
    const hash = await hashOtpCode('1234', 'test-pepper');
    expect(hash).toHaveLength(64);
    expect(await codesMatch('1234', hash, 'test-pepper')).toBe(true);
    expect(await codesMatch('1235', hash, 'test-pepper')).toBe(false);
    expect(await codesMatch('1234', hash, 'other-pepper')).toBe(false);
  });
});
