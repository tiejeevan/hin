export interface SendOtpEmailParams {
  apiKey: string;
  from: string;
  to: string;
  code: string;
}

export interface SendOtpEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a 4-digit verification code via Resend's HTTP API (no SDK).
 */
export async function sendOtpEmail(params: SendOtpEmailParams): Promise<SendOtpEmailResult> {
  const { apiKey, from, to, code } = params;

  const subject = 'Your Hin verification code';
  const text = `Your Hin verification code is ${code}.\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">Verify your email</h1>
      <p style="font-size: 15px; color: #444; margin: 0 0 20px;">Your Hin verification code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.35em; margin: 0 0 20px;">${code}</p>
      <p style="font-size: 13px; color: #888; margin: 0;">Expires in 10 minutes. If you did not request this, ignore this email.</p>
    </div>
  `.trim();

  return sendResendEmail({ apiKey, from, to, subject, text, html });
}

/**
 * Send a 6-digit password reset code via Resend.
 */
export async function sendPasswordResetOtpEmail(params: SendOtpEmailParams): Promise<SendOtpEmailResult> {
  const { apiKey, from, to, code } = params;

  const subject = 'Your Hin password reset code';
  const text = `Your Hin password reset code is ${code}.\n\nIt expires in 10 minutes. If you did not request a reset, you can ignore this email.`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 12px;">Reset your password</h1>
      <p style="font-size: 15px; color: #444; margin: 0 0 20px;">Your Hin password reset code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.35em; margin: 0 0 20px;">${code}</p>
      <p style="font-size: 13px; color: #888; margin: 0;">Expires in 10 minutes. If you did not request this, ignore this email.</p>
    </div>
  `.trim();

  return sendResendEmail({ apiKey, from, to, subject, text, html });
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendOtpEmailResult> {
  const { apiKey, from, to, subject, text, html } = params;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[resend] send failed', res.status, body);
      return { ok: false, error: 'Failed to send email' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[resend] network error', err);
    return { ok: false, error: 'Failed to send email' };
  }
}
