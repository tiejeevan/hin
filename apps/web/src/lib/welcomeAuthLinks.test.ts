import { describe, expect, it } from 'vitest';
import {
  appRegisterUrl,
  appSignInUrl,
  parseAuthIntent,
} from './welcomeAuthLinks';

describe('welcomeAuthLinks', () => {
  it('builds sign-in and register URLs', () => {
    expect(appSignInUrl()).toBe('/?auth=sign-in');
    expect(appRegisterUrl()).toBe('/?auth=register');
  });

  it('parseAuthIntent reads auth param and aliases', () => {
    expect(parseAuthIntent('?auth=sign-in')).toBe('sign-in');
    expect(parseAuthIntent('?auth=login')).toBe('sign-in');
    expect(parseAuthIntent('?auth=register')).toBe('register');
    expect(parseAuthIntent('?register=1')).toBe('register');
    expect(parseAuthIntent('')).toBe(null);
  });
});
