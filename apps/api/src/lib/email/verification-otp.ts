import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getJwtSecret, JWT_SECRET_DEV_FALLBACK } from '../auth';
import { getOutboundFromEmail } from './outbound-from';
import { sendOtpEmail } from './resend';
import { isSmtpConfigured } from './smtp';
import {
  OTP_PURPOSE_EMAIL_VERIFY,
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
} from '../otp';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface SendVerificationOtpResult {
  ok: boolean;
  error?: string;
  /** Plaintext code when dev SMTP is off or dev JWT fallback is active. */
  devCode?: string;
}

/** SMTP send only — no DB writes. */
export async function sendVerificationOtpEmail(
  env: Env,
  db: Db,
  to: string,
  code: string,
): Promise<SendVerificationOtpResult> {
  if (!isSmtpConfigured(env)) {
    console.log(`[dev] email verification OTP for ${to}: ${code}`);
    return { ok: true, devCode: code };
  }

  const from = await getOutboundFromEmail(db);
  const sent = await sendOtpEmail({ env, from, to, code });
  if (!sent.ok) {
    return { ok: false, error: sent.error || 'Failed to send verification email' };
  }

  const exposeDevCode = getJwtSecret(env) === JWT_SECRET_DEV_FALLBACK;
  return { ok: true, ...(exposeDevCode ? { devCode: code } : {}) };
}

export async function invalidateEmailVerificationOtps(db: Db, userId: number): Promise<void> {
  await db.update(schema.otpChallenges)
    .set({ consumedAt: new Date().toISOString() })
    .where(and(
      eq(schema.otpChallenges.userId, userId),
      eq(schema.otpChallenges.purpose, OTP_PURPOSE_EMAIL_VERIFY),
      isNull(schema.otpChallenges.consumedAt),
    ))
    .run();
}

export interface PersistEmailVerificationOtpParams {
  userId: number;
  email: string;
  codeHash: string;
  ipAddress: string | null;
}

/** Persist OTP challenge after successful send (resend path). */
export async function persistEmailVerificationOtp(
  db: Db,
  params: PersistEmailVerificationOtpParams,
): Promise<void> {
  await invalidateEmailVerificationOtps(db, params.userId);
  await db.insert(schema.otpChallenges).values({
    purpose: OTP_PURPOSE_EMAIL_VERIFY,
    userId: params.userId,
    email: params.email,
    codeHash: params.codeHash,
    attempts: 0,
    expiresAt: otpExpiresAt(),
    ipAddress: params.ipAddress,
  }).run();
}

export interface PreparedRegistrationOtp {
  code: string;
  codeHash: string;
}

export async function sendRegistrationVerificationOtp(
  env: Env,
  db: Db,
  email: string,
): Promise<PreparedRegistrationOtp & SendVerificationOtpResult> {
  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code, env.OTP_PEPPER);
  const sendResult = await sendVerificationOtpEmail(env, db, email, code);
  return { code, codeHash, ...sendResult };
}

export function registrationOtpFailureReason(
  env: Env,
  smtpError?: string,
): 'email_not_configured' | 'smtp_error' {
  if (smtpError === 'Email is not configured' || !isSmtpConfigured(env)) {
    return 'email_not_configured';
  }
  return 'smtp_error';
}
