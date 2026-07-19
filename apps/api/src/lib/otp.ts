/**
 * OTP helpers for email verification (and future auth flows).
 * Codes are never stored in plaintext — only a SHA-256 hash with pepper.
 */

export const OTP_PURPOSE_EMAIL_VERIFY = 'email_verify' as const;
export const OTP_PURPOSE_PASSWORD_RESET = 'password_reset' as const;
export type OtpPurpose =
  | typeof OTP_PURPOSE_EMAIL_VERIFY
  | typeof OTP_PURPOSE_PASSWORD_RESET
  | string;

export const OTP_LENGTH = 4;
export const OTP_RESET_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Password-reset send budgets (stricter than email verify). */
export const OTP_RESET_SEND_IP_PER_MINUTE = 1;
export const OTP_RESET_SEND_IP_PER_HOUR = 3;
export const OTP_RESET_SEND_IP_PER_DAY = 5;
export const OTP_RESET_SEND_USER_PER_HOUR = 3;
export const OTP_RESET_SEND_USER_PER_DAY = 5;
export const OTP_RESET_SEND_EMAIL_PER_HOUR = 3;
export const OTP_RESET_SEND_EMAIL_PER_DAY = 5;
export const OTP_RESET_VERIFY_IP_PER_HOUR = 10;
export const OTP_RESET_VERIFY_IP_PER_DAY = 20;

/** IP send budget ≈ 10/day, split across shorter windows. */
export const OTP_SEND_IP_PER_MINUTE = 1;       // 1 / 60s
export const OTP_SEND_IP_PER_HOUR = 3;         // 3 / hour
export const OTP_SEND_IP_PER_DAY = 10;         // 10 / day (hard cap)

export const OTP_SEND_USER_PER_HOUR = 3;
export const OTP_SEND_USER_PER_DAY = 10;
export const OTP_SEND_EMAIL_PER_HOUR = 3;
export const OTP_SEND_EMAIL_PER_DAY = 10;

export const OTP_VERIFY_IP_PER_HOUR = 10;
export const OTP_VERIFY_IP_PER_DAY = 30;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Practical RFC 5322-lite check; reject empty local/domain and spaces.
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function getPepper(envPepper?: string): string {
  return envPepper && envPepper.length > 0 ? envPepper : 'hin-otp-pepper-dev-only';
}

export async function hashOtpCode(code: string, pepper?: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${getPepper(pepper)}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateOtpCode(length = OTP_LENGTH): string {
  const max = 10 ** length;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0]! % max;
  return n.toString().padStart(length, '0');
}

export function otpExpiresAt(ttlSeconds = OTP_TTL_SECONDS): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

export async function codesMatch(
  plaintext: string,
  codeHash: string,
  pepper?: string,
): Promise<boolean> {
  const hashed = await hashOtpCode(plaintext, pepper);
  if (hashed.length !== codeHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hashed.length; i++) {
    diff |= hashed.charCodeAt(i) ^ codeHash.charCodeAt(i);
  }
  return diff === 0;
}
