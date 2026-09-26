import type { ModeratorStatus } from './permissions';

/** Public moderator badge: active moderators only; suspended moderators show no shield. */
export function shouldShowModeratorBadge(
  role: string | undefined | null,
  moderatorStatus?: ModeratorStatus | string | null,
): boolean {
  return role === 'moderator' && moderatorStatus !== 'suspended';
}
