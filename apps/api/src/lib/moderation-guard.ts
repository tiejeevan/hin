import type { AccountModerationStatus } from '@hin/types';

export type AccountModerationBlockCode = 'suspended' | 'banned';

export type ModerationGuardUser = {
  role?: string | null;
  accountModerationStatus?: string | null;
  accountModerationUntil?: string | null;
  accountModerationReason?: string | null;
};

export function isSuspensionExpired(until: string | null | undefined): boolean {
  if (!until) return false;
  return new Date(until).getTime() <= Date.now();
}

/** Returns block code when login/API access should be denied (not restricted — that is write-only). */
export function getAccountModerationBlockReason(
  user: ModerationGuardUser,
): AccountModerationBlockCode | null {
  const status = (user.accountModerationStatus ?? 'active') as AccountModerationStatus;
  if (status === 'banned') return 'banned';
  if (status === 'suspended') {
    if (isSuspensionExpired(user.accountModerationUntil)) return null;
    return 'suspended';
  }
  return null;
}

export function getAccountModerationBlockMessage(code: AccountModerationBlockCode): string {
  return code === 'banned'
    ? 'Your account has been banned'
    : 'Your account has been suspended';
}

export function isAccountRestricted(user: ModerationGuardUser): boolean {
  return (user.accountModerationStatus ?? 'active') === 'restricted';
}

export type AppRole = 'user' | 'moderator' | 'admin';

export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === 'admin') return 'admin';
  if (role === 'moderator') return 'moderator';
  return 'user';
}

/** Moderators may only act on plain users; admins may act on users and moderators (not other admins). */
export function canActOnTarget(actorRole: string, targetRole: string, actorId: number, targetId: number): boolean {
  if (actorId === targetId) return false;
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  if (target === 'admin') return false;
  if (actor === 'admin') return true;
  if (actor === 'moderator') return target === 'user';
  return false;
}
