import { describe, expect, it } from 'vitest';
import {
  buildOtpEmailHtml,
  buildOtpEmailText,
  buildVerificationEmail,
} from './templates';

describe('email templates', () => {
  it('includes OTP clearly in text and html', () => {
    const content = buildVerificationEmail('1234');
    const text = buildOtpEmailText(content);
    const html = buildOtpEmailHtml(content);

    expect(text).toContain('1234');
    expect(text).toContain('Verify your email');
    expect(html).toContain('1234');
    expect(html).toContain('Verify your email');
    expect(html).toContain('do not reply');
  });

  it('escapes html in user-facing strings', () => {
    const html = buildOtpEmailHtml(buildVerificationEmail('<script>'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
