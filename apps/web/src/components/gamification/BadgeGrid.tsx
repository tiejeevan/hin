import { useState } from 'react';
import { Award, Check, X } from 'lucide-react';
import type { GamificationPublicBadge } from '@hin/types';

interface BadgeGridProps {
  badges: GamificationPublicBadge[];
  className?: string;
  /** Own profile with gamification enabled — shows equip controls. */
  equippable?: boolean;
  equippedIds?: number[];
  /** Max badges the user may equip. `null` = unlimited (admins). */
  maxEquipped?: number | null;
  onToggleEquip?: (badgeId: number) => void;
}

function formatEarnedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function BadgeGrid({
  badges,
  className = '',
  equippable = false,
  equippedIds = [],
  maxEquipped = null,
  onToggleEquip,
}: BadgeGridProps) {
  const [selected, setSelected] = useState<GamificationPublicBadge | null>(null);

  if (badges.length === 0) return null;

  const equippedSet = new Set(equippedIds);
  const atMax = maxEquipped !== null && equippedSet.size >= maxEquipped;
  const selectedIsEquipped = selected ? equippedSet.has(selected.id) : false;

  return (
    <div className={className}>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Award className="h-3.5 w-3.5" />
        Badges
        {equippable && (
          <span className="text-[10px] font-medium text-text-muted normal-case tracking-normal">
            · Equipped {equippedSet.size}{maxEquipped !== null ? `/${maxEquipped}` : ''}
          </span>
        )}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {badges.map(badge => {
          const isEquipped = equippedSet.has(badge.id);
          return (
            <button
              key={badge.id}
              type="button"
              onClick={() => setSelected(badge)}
              className={`relative rounded-lg border p-0.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                isEquipped
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-border-custom bg-bg-tertiary/60 hover:bg-bg-tertiary hover:border-amber-500/40'
              }`}
              title={badge.name}
              aria-label={`View badge ${badge.name}`}
            >
              {badge.imageUrl ? (
                <img
                  src={badge.imageUrl}
                  alt=""
                  className="h-6 w-6 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="h-6 w-6 rounded-md bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Award className="h-3.5 w-3.5 text-amber-400" />
                </div>
              )}
              {isEquipped && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center border border-bg-secondary">
                  <Check className="h-2 w-2 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Badge ${selected.name}`}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border-custom bg-bg-secondary shadow-2xl p-5 space-y-4 animate-panel-pop-anchor"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-end -mt-1 -mr-1">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-text-primary cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col items-center text-center gap-3">
              {selected.imageUrl ? (
                <img
                  src={selected.imageUrl}
                  alt=""
                  className="h-20 w-20 rounded-xl object-cover shadow-lg"
                />
              ) : (
                <div className="h-20 w-20 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                  <Award className="h-9 w-9 text-amber-400" />
                </div>
              )}
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text-primary">{selected.name}</h3>
                {selected.description && (
                  <p className="text-xs text-text-secondary leading-relaxed">{selected.description}</p>
                )}
              </div>
              {selected.earnedAt && (
                <p className="text-[11px] text-text-muted">
                  Earned {formatEarnedAt(selected.earnedAt)}
                </p>
              )}
              {equippable && onToggleEquip && (
                <button
                  type="button"
                  disabled={!selectedIsEquipped && atMax}
                  onClick={() => onToggleEquip(selected.id)}
                  className={`w-full mt-1 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedIsEquipped
                      ? 'border border-border-custom bg-bg-tertiary text-text-primary hover:bg-bg-tertiary/80'
                      : 'bg-amber-500 hover:bg-amber-400 text-white'
                  }`}
                >
                  {selectedIsEquipped ? 'Unequip' : atMax ? `Max ${maxEquipped} equipped` : 'Equip next to your name'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
