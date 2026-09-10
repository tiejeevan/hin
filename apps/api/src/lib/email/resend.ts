import type { Env } from '../../types';
import { sendSmtpEmail } from './smtp';
import {
  buildOtpEmailHtml,
  buildOtpEmailText,
  buildPasswordResetEmail,
  buildVerificationEmail,
} from './templates';

export interface SendOtpEmailParams {
  env: Env;
  from: string;
  to: string;
  code: string;
}

export interface SendOtpEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a 4-digit verification code via Oracle Email Delivery (SMTP).
 */
export async function sendOtpEmail(params: SendOtpEmailParams): Promise<SendOtpEmailResult> {
  const { env, from, to, code } = params;
  const content = buildVerificationEmail(code);
  return sendSmtpEmail(env, {
    from,
    to,
    subject: content.subject,
    text: buildOtpEmailText(content),
    html: buildOtpEmailHtml(content),
  });
}

/**
 * Send a 6-digit password reset code via Oracle Email Delivery (SMTP).
 */
export async function sendPasswordResetOtpEmail(params: SendOtpEmailParams): Promise<SendOtpEmailResult> {
  const { env, from, to, code } = params;
  const content = buildPasswordResetEmail(code);
  return sendSmtpEmail(env, {
    from,
    to,
    subject: content.subject,
    text: buildOtpEmailText(content),
    html: buildOtpEmailHtml(content),
  });
}
