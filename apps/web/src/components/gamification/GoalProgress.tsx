import { Target } from 'lucide-react';
import type { GamificationPublicGoal } from '@hin/types';

interface GoalProgressProps {
  goals: GamificationPublicGoal[];
  className?: string;
}

export function GoalProgress({ goals, className = '' }: GoalProgressProps) {
  if (goals.length === 0) return null;

  return (
    <div className={className}>
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5" />
        Goals in progress
      </h2>
      <div className="space-y-3">
        {goals.map(goal => {
          const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
          return (
            <div
              key={goal.badgeId}
              className="rounded-xl border border-border-custom bg-bg-tertiary/40 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-text-primary">{goal.name}</span>
                <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                  {goal.current}/{goal.target}
                </span>
              </div>
              {goal.description && (
                <p className="text-[10px] text-text-muted mb-2 line-clamp-2">{goal.description}</p>
              )}
              <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
