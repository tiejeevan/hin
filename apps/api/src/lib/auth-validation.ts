import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@hin/types';
import { isValidEmail, normalizeEmail } from './otp';
import { isDisposableEmail } from './email/disposable';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export const USERNAME_MIN = USERNAME_MIN_LENGTH;
export const USERNAME_MAX = USERNAME_MAX_LENGTH;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export const RESERVED_USERNAMES = new Set([
  'admin',
  'support',
  'help',
  'hin',
  'system',
  'moderator',
  'root',
  'api',
  'www',
  'mail',
  'email',
  'security',
  'staff',
  'team',
  'official',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsernameFormat(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (normalized.length < USERNAME_MIN) {
    return `Username must be at least ${USERNAME_MIN} characters`;
  }
  if (normalized.length > USERNAME_MAX) {
    return `Username must be at most ${USERNAME_MAX} characters`;
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Username may only contain lowercase letters, numbers, and underscores';
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return 'This username is reserved';
  }
  return null;
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(username));
}

export function validatePassword(password: string, strict: boolean): string | null {
  if (!password || password.length < 1) {
    return 'Password is required';
  }
  if (password.length > 128) {
    return 'Password is too long';
  }
  if (!strict) return null;

  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/\d/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  if (classes < 3) {
    return 'Password must include at least 3 of: uppercase, lowercase, number, symbol';
  }
  return null;
}

export interface EmailAvailabilityResult {
  ok: boolean;
  error?: string;
  isGoogleAccount?: boolean;
}

export async function checkEmailAvailableForRegistration(
  db: Db,
  email: string,
  excludeUserId?: number,
): Promise<EmailAvailabilityResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, error: 'Enter a valid email address' };
  }
  if (isDisposableEmail(normalized)) {
    return { ok: false, error: 'Temporary email addresses are not allowed' };
  }

  const existing = await db.select({
    id: schema.users.id,
    googleId: schema.users.googleId,
    deletedAt: schema.users.deletedAt,
  })
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .get();

  if (existing && existing.deletedAt) {
    return { ok: false, error: 'This email is not available' };
  }
  if (existing && excludeUserId && existing.id === excludeUserId) {
    return { ok: true };
  }
  if (existing) {
    if (existing.googleId) {
      return {
        ok: false,
        error: 'This email is registered with Google. Sign in with Google.',
        isGoogleAccount: true,
      };
    }
    return { ok: false, error: 'This email is already in use' };
  }
  return { ok: true };
}

export async function isUsernameAvailable(
  db: Db,
  username: string,
  excludeUserId?: number,
): Promise<{ available: boolean; reason?: string }> {
  const formatError = validateUsernameFormat(username);
  if (formatError) {
    return { available: false, reason: formatError };
  }
  const normalized = normalizeUsername(username);
  const existing = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, normalized))
    .get();

  if (existing && excludeUserId && existing.id === excludeUserId) {
    return { available: true };
  }
  if (existing) {
    return { available: false, reason: 'Username already taken' };
  }
  return { available: true };
}

export async function checkGoogleEmailCollision(
  db: Db,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: true };

  const owner = await db.select({
    id: schema.users.id,
    googleId: schema.users.googleId,
  })
    .from(schema.users)
    .where(and(
      eq(schema.users.email, normalized),
      isNull(schema.users.deletedAt),
    ))
    .get();

  if (owner && !owner.googleId) {
    return { ok: false, error: 'An account with this email already exists. Sign in with your password.' };
  }
  return { ok: true };
}

export function provisionalUsername(): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `u_${id}`;
}

/** Detect if username looks like legacy Google auto-assigned value. */
export function needsUsernameSetupForExistingUser(user: {
  username: string;
  googleId: string | null;
  needsUsernameSetup?: number | boolean | null;
}): boolean {
  if (user.needsUsernameSetup) return true;
  if (!user.googleId) return false;
  if (user.username.startsWith('u_')) return true;
  const formatError = validateUsernameFormat(user.username);
  return formatError !== null;
}
