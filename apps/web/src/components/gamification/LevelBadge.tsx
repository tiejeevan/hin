interface LevelBadgeProps {
  level: number;
  className?: string;
}

export function LevelBadge({ level, className = '' }: LevelBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-lg text-[11px] font-bold bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 text-amber-400 ${className}`}
      title={`Level ${level}`}
    >
      Lv {level}
    </span>
  );
}
