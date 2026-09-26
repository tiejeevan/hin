import { Shield } from 'lucide-react';
import { shouldShowModeratorBadge, type ModeratorStatus } from '@hin/types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

const MODERATOR_SHIELD_ANIMATED = '/role-badges/moderator-shield.svg';
const MODERATOR_SHIELD_STATIC = '/role-badges/moderator-shield-static.svg';

const SIZE_CLASSES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
} as const;

const PIXEL_SIZE = {
  sm: 12,
  md: 16,
} as const;

export interface UserRoleBadgeProps {
  role?: string | null;
  moderatorStatus?: ModeratorStatus | string | null;
  size?: keyof typeof SIZE_CLASSES;
  /** Profile only: animated moderator shield when motion is allowed. */
  animated?: boolean;
  className?: string;
}

export function UserRoleBadge({
  role,
  moderatorStatus,
  size = 'sm',
  animated = false,
  className = '',
}: UserRoleBadgeProps) {
  const reducedMotion = usePrefersReducedMotion();

  if (role === 'admin') {
    return (
      <Shield
        className={`${SIZE_CLASSES[size]} text-amber-500 shrink-0 inline ${className}`.trim()}
        aria-label="Admin"
      />
    );
  }

  if (!shouldShowModeratorBadge(role, moderatorStatus)) {
    return null;
  }

  const useAnimated = animated && !reducedMotion;
  const src = useAnimated ? MODERATOR_SHIELD_ANIMATED : MODERATOR_SHIELD_STATIC;
  const px = PIXEL_SIZE[size];

  return (
    <img
      src={src}
      alt=""
      role="img"
      aria-label="Moderator"
      title="Moderator"
      width={px}
      height={px}
      decoding="async"
      draggable={false}
      className={`${SIZE_CLASSES[size]} shrink-0 inline-block object-contain align-text-bottom ${className}`.trim()}
    />
  );
}
