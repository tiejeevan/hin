import { describe, expect, it } from 'vitest';
import {
  normalizeUsername,
  validatePassword,
  validateUsernameFormat,
  isReservedUsername,
} from './auth-validation';

describe('validateUsernameFormat', () => {
  it('accepts valid usernames', () => {
    expect(validateUsernameFormat('macp')).toBeNull();
    expect(validateUsernameFormat('tiejeevan')).toBeNull();
    expect(validateUsernameFormat('user_123')).toBeNull();
  });

  it('rejects short usernames', () => {
    expect(validateUsernameFormat('abc')).toMatch(/at least 4/i);
  });

  it('rejects invalid characters', () => {
    expect(validateUsernameFormat('User-Name')).not.toBeNull();
  });

  it('rejects reserved names', () => {
    expect(validateUsernameFormat('support')).toMatch(/reserved/i);
  });
});

describe('normalizeUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  FooBar  ')).toBe('foobar');
  });
});

describe('isReservedUsername', () => {
  it('flags admin', () => {
    expect(isReservedUsername('admin')).toBe(true);
    expect(isReservedUsername('myuser')).toBe(false);
  });
});

describe('validatePassword', () => {
  it('allows any non-empty password when strict is off', () => {
    expect(validatePassword('a', false)).toBeNull();
    expect(validatePassword('', false)).not.toBeNull();
  });

  it('enforces complexity when strict is on', () => {
    expect(validatePassword('short', true)).not.toBeNull();
    expect(validatePassword('GoodPass1!', true)).toBeNull();
  });
});
