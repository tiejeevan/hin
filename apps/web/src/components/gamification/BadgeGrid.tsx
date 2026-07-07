import { Award } from 'lucide-react';
import type { GamificationPublicBadge } from '@hin/types';

interface BadgeGridProps {
  badges: GamificationPublicBadge[];
  className?: string;
}

export function BadgeGrid({ badges, className = '' }: BadgeGridProps) {
  if (badges.length === 0) return null;

  return (
    <div className={className}>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Award className="h-3.5 w-3.5" />
        Badges
      </h2>
      <div className="flex flex-wrap gap-2">
        {badges.map(badge => (
          <div
            key={badge.id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border-custom bg-bg-tertiary/60"
            title={`Earned ${new Date(badge.earnedAt).toLocaleDateString()}`}
          >
            {badge.imageUrl ? (
              <img
                src={badge.imageUrl}
                alt=""
                className="h-8 w-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Award className="h-4 w-4 text-amber-400" />
              </div>
            )}
            <span className="text-[11px] font-medium text-text-primary max-w-[120px] truncate">
              {badge.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
