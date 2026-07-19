/**
 * Email change cooldown helpers.
 * First verification is always allowed; changing to a different address
 * is locked for EMAIL_CHANGE_COOLDOWN_DAYS after emailVerifiedAt.
 */

export const EMAIL_CHANGE_COOLDOWN_DAYS = 15;

export function getEmailChangeStatus(emailVerifiedAt: string | null | undefined): {
  canChangeEmail: boolean;
  nextChangeAt: string | null;
  daysRemaining: number | null;
} {
  if (!emailVerifiedAt) {
    return { canChangeEmail: true, nextChangeAt: null, daysRemaining: null };
  }

  const verifiedMs = Date.parse(emailVerifiedAt);
  if (!Number.isFinite(verifiedMs)) {
    return { canChangeEmail: true, nextChangeAt: null, daysRemaining: null };
  }

  const nextMs = verifiedMs + EMAIL_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (now >= nextMs) {
    return { canChangeEmail: true, nextChangeAt: null, daysRemaining: null };
  }

  const daysRemaining = Math.max(1, Math.ceil((nextMs - now) / (24 * 60 * 60 * 1000)));
  return {
    canChangeEmail: false,
    nextChangeAt: new Date(nextMs).toISOString(),
    daysRemaining,
  };
}
