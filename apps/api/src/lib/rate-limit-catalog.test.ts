import { describe, expect, it } from 'vitest';
import { getRateLimitCatalog } from './rate-limit-catalog';

describe('getRateLimitCatalog', () => {
  it('returns HTTP, OTP, WS, and gamification tiers', () => {
    const catalog = getRateLimitCatalog();
    expect(catalog.entries.length).toBeGreaterThan(10);
    expect(catalog.adminBypass).toMatch(/admin/i);
    expect(catalog.exemptions.length).toBeGreaterThan(0);

    const tiers = catalog.entries.map((e) => e.tier);
    expect(tiers).toContain('Global API baseline');
    expect(tiers).toContain('Login');
    expect(tiers).toContain('Registration OTP verify');
    expect(tiers).toContain('Chat send_message');
  });
});
