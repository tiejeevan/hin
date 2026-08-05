import { useEffect } from 'react';
import { Link2, Quote, Repeat2, Share2, X } from 'lucide-react';
import type { Post } from '@hin/types';

interface ReshareSheetProps {
  post: Post;
  open: boolean;
  onClose: () => void;
  onRepost: () => void;
  onUndoRepost: () => void;
  onQuote: () => void;
  onCopyLink: () => void;
  onShareExternal: () => void;
  requireAuth: (action: () => void) => void;
}

export function ReshareSheet({
  post,
  open,
  onClose,
  onRepost,
  onUndoRepost,
  onQuote,
  onCopyLink,
  onShareExternal,
  requireAuth,
}: ReshareSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const hasReposted = !!post.hasReposted;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 animate-backdrop-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Reshare post"
        className="relative w-full sm:max-w-md bg-bg-secondary border border-border-custom rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-panel-pop-anchor"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-custom">
          <h2 className="text-sm font-semibold text-text-primary">Reshare</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="py-1">
          <button
            type="button"
            onClick={() =>
              requireAuth(() => {
                if (hasReposted) onUndoRepost();
                else onRepost();
                onClose();
              })
            }
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors cursor-pointer min-h-[44px] ${
              hasReposted
                ? 'text-emerald-400 hover:bg-emerald-500/10'
                : 'text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            <Repeat2 className="h-4.5 w-4.5" />
            {hasReposted ? 'Undo repost' : 'Repost'}
          </button>
          <button
            type="button"
            onClick={() =>
              requireAuth(() => {
                onQuote();
                onClose();
              })
            }
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px]"
          >
            <Quote className="h-4.5 w-4.5" />
            Quote post
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyLink();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px]"
          >
            <Link2 className="h-4.5 w-4.5" />
            Copy link
          </button>
          <button
            type="button"
            onClick={() => {
              onShareExternal();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px]"
          >
            <Share2 className="h-4.5 w-4.5" />
            Share via…
          </button>
        </div>
      </div>
    </div>
  );
}
