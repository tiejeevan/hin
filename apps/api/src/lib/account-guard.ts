export type AccountBlockReason = 'username_setup_required' | 'email_verification_required';

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

export function isAccountSetupComplete(user: Parameters<typeof getAccountBlockReason>[0]): boolean {
  return getAccountBlockReason(user) === null;
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
