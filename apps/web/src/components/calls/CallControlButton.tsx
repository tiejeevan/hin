import type { FocusEvent, MouseEvent, ReactNode } from 'react';

export type CallControlButtonVariant =
  | 'neutral'
  | 'active-positive'
  | 'active-negative'
  | 'active-route'
  | 'compact-voice'
  | 'compact-video';

export type CallControlButtonSize = 'sm' | 'lg';

const VARIANT_CLASSES: Record<CallControlButtonVariant, string> = {
  neutral: 'bg-white/15 hover:bg-white/25 text-white',
  'active-positive': 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg',
  'active-negative': 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg',
  'active-route': 'bg-indigo-600/80 hover:bg-indigo-500/80 text-white',
  'compact-voice': 'rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-bg-tertiary',
  'compact-video': 'rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-bg-tertiary',
};

const SIZE_CLASSES: Record<CallControlButtonSize, string> = {
  sm: 'h-8 w-8',
  lg: 'h-14 w-14 rounded-full',
};

const ICON_SIZE: Record<CallControlButtonSize, string> = {
  sm: 'h-4 w-4',
  lg: 'h-6 w-6',
};

interface CallControlButtonProps {
  variant: CallControlButtonVariant;
  size?: CallControlButtonSize;
  icon: ReactNode;
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void;
  onFocus?: (event: FocusEvent<HTMLButtonElement>) => void;
  'aria-label': string;
  title?: string;
  className?: string;
}

export function CallControlButton({
  variant,
  size = 'lg',
  icon,
  label,
  disabled,
  onClick,
  onMouseEnter,
  onFocus,
  'aria-label': ariaLabel,
  title,
  className = '',
}: CallControlButtonProps) {
  const isCompact = variant === 'compact-voice' || variant === 'compact-video';
  const baseSize = isCompact ? SIZE_CLASSES.sm : SIZE_CLASSES[size];
  const shape = label && !isCompact ? 'h-14 px-6 rounded-full' : baseSize;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={[
        'flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        !isCompact && 'active:scale-95',
        VARIANT_CLASSES[variant],
        shape,
        isCompact && 'disabled:opacity-40',
        className,
      ].filter(Boolean).join(' ')}
    >
      <span className={`inline-flex shrink-0 ${isCompact ? ICON_SIZE.sm : ICON_SIZE[size]}`}>
        {icon}
      </span>
      {label && (
        <span className="text-sm font-semibold">{label}</span>
      )}
    </button>
  );
}

export function callControlIconClass(size: CallControlButtonSize = 'lg'): string {
  return ICON_SIZE[size];
}
