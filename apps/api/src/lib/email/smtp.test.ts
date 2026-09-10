import { describe, expect, it } from 'vitest';
import { isSmtpConfigured } from './smtp';
import type { Env } from '../../types';

describe('isSmtpConfigured', () => {
  it('returns false when SMTP password is missing', () => {
    expect(isSmtpConfigured({
      OCI_SMTP_USERNAME: 'user@tenancy',
    } as Env)).toBe(false);
  });

  it('returns true when username and password are set', () => {
    expect(isSmtpConfigured({
      OCI_SMTP_USERNAME: 'user@tenancy',
      OCI_SMTP_PASSWORD: 'secret',
    } as Env)).toBe(true);
  });
});
