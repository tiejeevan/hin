import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OUTBOUND_FROM_EMAIL,
  HINGOT_OUTBOUND_FROM_SUGGESTIONS,
  isHingotOutboundEmail,
  outboundFromWarnings,
} from '@hin/types';

describe('outboundFromWarnings', () => {
  it('returns no warnings for suggested addresses', () => {
    for (const addr of HINGOT_OUTBOUND_FROM_SUGGESTIONS) {
      expect(outboundFromWarnings(addr)).toEqual([]);
    }
  });

  it('warns for custom @hingot.com addresses', () => {
    const warnings = outboundFromWarnings('custom@hingot.com');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Oracle approved sender/i);
  });
});

describe('isHingotOutboundEmail', () => {
  it('accepts @hingot.com addresses', () => {
    expect(isHingotOutboundEmail(DEFAULT_OUTBOUND_FROM_EMAIL)).toBe(true);
    expect(isHingotOutboundEmail('support@HINGOT.COM')).toBe(true);
  });

  it('rejects other domains', () => {
    expect(isHingotOutboundEmail('support@example.com')).toBe(false);
  });
});
