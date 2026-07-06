import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FeedMode } from '../../types/ui';

const FEED_MODES: { value: FeedMode; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'following', label: 'Following' },
  { value: 'bookmarks', label: 'Saved' },
  { value: 'explore', label: 'Explore' },
];

function feedModeLabel(mode: FeedMode): string {
  return FEED_MODES.find(m => m.value === mode)?.label ?? 'Everyone';
}

interface FeedModeSelectorProps {
  feedMode: FeedMode;
  onFeedModeChange: (mode: FeedMode) => void;
}

export function FeedModeSelector({ feedMode, onFeedModeChange }: FeedModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const selectMode = useCallback(
    (mode: FeedMode) => {
      onFeedModeChange(mode);
      close();
    },
    [close, onFeedModeChange],
  );

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [close, open]);

  const currentLabel = feedModeLabel(feedMode);

  return (
    <div ref={rootRef} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-text-primary bg-bg-secondary border border-border-custom cursor-pointer min-h-[44px] hover:bg-bg-tertiary transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Feed: ${currentLabel}`}
      >
        <span>{currentLabel}</span>
        <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-full max-w-xs rounded-2xl border border-border-custom bg-bg-secondary shadow-xl overflow-hidden z-30"
        >
          {FEED_MODES.map(({ value, label }) => {
            const selected = feedMode === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitem"
                onClick={() => selectMode(value)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-[48px] text-sm font-medium transition-colors cursor-pointer ${
                  selected
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
              >
                <span>{label}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-indigo-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
