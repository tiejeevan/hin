import { describe, expect, it } from 'vitest';
import {
  buildBucketKey,
  isGlobalRateLimitExemptPath,
  isSearchPath,
  isWriteMethod,
  isWriteRateLimitExemptPath,
} from './rate-limit-policy';

describe('rate limit policy helpers', () => {
  it('builds bucket keys', () => {
    expect(buildBucketKey('api:global', 'ip', '1.2.3.4')).toBe('api:global:ip:1.2.3.4');
    expect(buildBucketKey('api:write', 'user', 99)).toBe('api:write:user:99');
  });

  it('detects write methods', () => {
    expect(isWriteMethod('POST')).toBe(true);
    expect(isWriteMethod('GET')).toBe(false);
  });

  it('detects search paths', () => {
    expect(isSearchPath('/api/search')).toBe(true);
    expect(isSearchPath('/api/search/advanced')).toBe(true);
    expect(isSearchPath('/api/posts')).toBe(false);
  });

  it('exempts global baseline paths', () => {
    expect(isGlobalRateLimitExemptPath('/', 'GET')).toBe(true);
    expect(isGlobalRateLimitExemptPath('/ws', 'GET')).toBe(true);
    expect(isGlobalRateLimitExemptPath('/api/media/foo.jpg', 'GET')).toBe(true);
    expect(isGlobalRateLimitExemptPath('/api/media/foo.jpg', 'POST')).toBe(false);
    expect(isGlobalRateLimitExemptPath('/api/posts', 'GET')).toBe(false);
  });

  it('exempts dedicated write-limit paths', () => {
    expect(isWriteRateLimitExemptPath('/api/auth/username-available')).toBe(true);
    expect(isWriteRateLimitExemptPath('/api/auth/password-reset/request')).toBe(true);
    expect(isWriteRateLimitExemptPath('/api/users/me/email/request')).toBe(true);
    expect(isWriteRateLimitExemptPath('/api/posts')).toBe(false);
  });
});
