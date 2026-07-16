import { useEffect, useRef, useState } from 'react';
import { MessageCircle, MoreVertical, PenSquare } from 'lucide-react';

interface ItemActionsMenuProps {
  onSendToChat: () => void;
  onPostIt: () => void;
  /** Compact trigger for grid cards over images. */
  compact?: boolean;
  className?: string;
}

export function ItemActionsMenu({
  onSendToChat,
  onPostIt,
  compact = false,
  className = '',
}: ItemActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setOpen(prev => !prev);
        }}
        className={
          compact
            ? 'p-1.5 rounded-lg bg-black/55 text-white hover:bg-black/75 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center'
            : 'p-2.5 rounded-xl hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors'
        }
        title="Item options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Item options"
      >
        <MoreVertical className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden z-30"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSendToChat();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-amber-500 transition-colors cursor-pointer min-h-[44px]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Send to chat
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPostIt();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-amber-500 transition-colors cursor-pointer min-h-[44px]"
          >
            <PenSquare className="h-3.5 w-3.5" />
            Post it
          </button>
        </div>
      )}
    </div>
  );
}
