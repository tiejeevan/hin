import { Sparkles } from 'lucide-react';

interface PointsDisplayProps {
  totalPoints: number;
  pointsEarned?: number;
  compact?: boolean;
  className?: string;
}

export function PointsDisplay({ totalPoints, pointsEarned, compact, className = '' }: PointsDisplayProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-amber-400/90 ${compact ? 'text-[11px]' : 'text-xs'} ${className}`}
      title={`${totalPoints.toLocaleString()} total points`}
    >
      <Sparkles className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span className="font-semibold tabular-nums">{totalPoints.toLocaleString()}</span>
      {pointsEarned != null && pointsEarned > 0 && (
        <span className="text-emerald-400 font-medium">+{pointsEarned}</span>
      )}
    </span>
  );
}
