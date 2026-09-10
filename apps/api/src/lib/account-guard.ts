import { eq, and, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@hin/db';

export type AccountBlockReason = 'username_setup_required' | 'email_verification_required';

export type AccountGuardUser = Parameters<typeof getAccountBlockReason>[0];

function hasPasswordAccount(user: { passwordHash?: string | null }): boolean {
  return !!(user.passwordHash && user.passwordHash.length > 0);
}

function hasEmailOnFile(user: { email?: string | null }): boolean {
  return !!(user.email && user.email.trim().length > 0);
}

/** Password signup users with an email must verify inbox OTP before full access. */
export function userNeedsEmailVerification(user: {
  email?: string | null;
  emailVerifiedAt?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
}): boolean {
  return (
    hasPasswordAccount(user)
    && !user.googleId
    && hasEmailOnFile(user)
    && !user.emailVerifiedAt
  );
}

export function getAccountBlockReason(user: {
  needsUsernameSetup?: number | boolean | null;
  email?: string | null;
  emailVerifiedAt?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
}): AccountBlockReason | null {
  if (user.needsUsernameSetup) {
    return 'username_setup_required';
  }
  if (userNeedsEmailVerification(user)) {
    return 'email_verification_required';
  }
  return null;
}

export function isAccountSetupComplete(user: AccountGuardUser): boolean {
  return getAccountBlockReason(user) === null;
}

export function getAccountBlockMessage(reason: AccountBlockReason): string {
  return reason === 'username_setup_required'
    ? 'Choose a username to continue'
    : 'Verify your email to continue';
}

type AccountGuardDb = DrizzleD1Database<typeof schema>;

/** Load minimal user fields for account-guard checks (non-deleted users only). */
export async function loadUserForAccountGuard(
  db: AccountGuardDb,
  userId: number,
): Promise<AccountGuardUser | null> {
  const user = await db
    .select({
      needsUsernameSetup: schema.users.needsUsernameSetup,
      email: schema.users.email,
      emailVerifiedAt: schema.users.emailVerifiedAt,
      passwordHash: schema.users.passwordHash,
      googleId: schema.users.googleId,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        sql`${schema.users.deletedAt} IS NULL`,
      ),
    )
    .get();

  return user ?? null;
}

/** Paths allowed while account setup is incomplete (prefix match on pathname). */
export const INCOMPLETE_ACCOUNT_ALLOWLIST: string[] = [
  '/api/auth/logout',
  '/api/auth/complete-username',
  '/api/auth/verify-registration',
  '/api/auth/turnstile-config',
  '/api/users/me/email',
  '/api/me/bootstrap',
  '/api/me',
];

export function isIncompleteAccountPathAllowed(pathname: string): boolean {
  return INCOMPLETE_ACCOUNT_ALLOWLIST.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
