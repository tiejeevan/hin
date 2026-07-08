import { Award } from 'lucide-react';
import type { EquippedBadgePublic } from '@hin/types';

interface EquippedBadgesInlineProps {
  badges: EquippedBadgePublic[];
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

const FALLBACK_ICON_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

/** Badge images a user has equipped, shown inline next to their username at the same size as the admin Shield icon. */
export function EquippedBadgesInline({ badges, size = 'sm', className = '' }: EquippedBadgesInlineProps) {
  if (badges.length === 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {badges.map(badge => (
        badge.imageUrl ? (
          <img
            key={badge.id}
            src={badge.imageUrl}
            alt={badge.name}
            title={badge.name}
            className={`${SIZE_CLASSES[size]} rounded-sm object-cover shrink-0`}
          />
        ) : (
          <span
            key={badge.id}
            title={badge.name}
            className={`${SIZE_CLASSES[size]} rounded-sm bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0`}
          >
            <Award className={`${FALLBACK_ICON_CLASSES[size]} text-amber-400`} />
          </span>
        )
      ))}
    </span>
  );
}
