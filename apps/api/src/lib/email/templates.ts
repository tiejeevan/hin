export interface OtpEmailContent {
  subject: string;
  heading: string;
  intro: string;
  code: string;
  expiryNote: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildVerificationEmail(code: string): OtpEmailContent {
  return {
    subject: 'Your Hin verification code',
    heading: 'Verify your email',
    intro: 'Use this code to finish setting up your Hin account:',
    code,
    expiryNote: 'This code expires in 10 minutes.',
  };
}

export function buildPasswordResetEmail(code: string): OtpEmailContent {
  return {
    subject: 'Your Hin password reset code',
    heading: 'Reset your password',
    intro: 'Use this code to reset your Hin password:',
    code,
    expiryNote: 'This code expires in 10 minutes.',
  };
}

export function buildOtpEmailText(content: OtpEmailContent): string {
  return [
    'Hin',
    '—'.repeat(32),
    content.heading,
    '',
    content.intro,
    '',
    `  ${content.code}`,
    '',
    content.expiryNote,
    'If you did not request this, you can safely ignore this email.',
    '',
    '—'.repeat(32),
    'Hin · hingot.com',
    'This is an automated message — please do not reply.',
  ].join('\n');
}

export function buildOtpEmailHtml(content: OtpEmailContent): string {
  const heading = escapeHtml(content.heading);
  const intro = escapeHtml(content.intro);
  const code = escapeHtml(content.code);
  const expiry = escapeHtml(content.expiryNote);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Hin</p>
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">${heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3f3f46;">${intro}</p>
              <div style="text-align:center;margin:0 0 28px;">
                <div style="display:inline-block;background:#f4f4f5;border:2px dashed #c7d2fe;border-radius:12px;padding:20px 36px;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">Your code</p>
                  <p style="margin:0;font-size:36px;font-weight:800;letter-spacing:0.35em;color:#18181b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</p>
                </div>
              </div>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#71717a;text-align:center;">${expiry}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #e4e4e7;background:#fafafa;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#71717a;">If you did not request this, you can safely ignore this email.</p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">Hin · hingot.com · Automated message — do not reply</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface ContactInquiryEmailParams {
  name: string;
  email: string;
  topicLabel: string;
  message: string;
}

export function buildContactInquirySubject(name: string, topicLabel: string): string {
  return `[Hin Contact] ${topicLabel} — ${name}`;
}

export function buildContactInquiryText(params: ContactInquiryEmailParams): string {
  return [
    'New contact form submission',
    '—'.repeat(32),
    `Topic: ${params.topicLabel}`,
    `From: ${params.name} <${params.email}>`,
    '',
    params.message,
    '',
    '—'.repeat(32),
    'Reply directly to this email to respond to the sender.',
  ].join('\n');
}

export function buildContactInquiryHtml(params: ContactInquiryEmailParams): string {
  const name = escapeHtml(params.name);
  const email = escapeHtml(params.email);
  const topic = escapeHtml(params.topicLabel);
  const message = escapeHtml(params.message).replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Contact inquiry</title></head>
<body style="margin:0;padding:24px;font-family:system-ui,sans-serif;color:#18181b;">
  <h1 style="font-size:20px;margin:0 0 16px;">New contact form submission</h1>
  <p style="margin:0 0 8px;"><strong>Topic:</strong> ${topic}</p>
  <p style="margin:0 0 16px;"><strong>From:</strong> ${name} &lt;${email}&gt;</p>
  <div style="padding:16px;background:#f4f4f5;border-radius:8px;line-height:1.6;">${message}</div>
  <p style="margin:24px 0 0;font-size:13px;color:#71717a;">Reply to this email to reach the sender.</p>
</body>
</html>`;
}
