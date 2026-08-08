import { useEffect, useState } from 'react';
import { Link2, Quote, Repeat2, Share2, X } from 'lucide-react';
import { Drawer } from 'vaul';
import type { Post } from '@hin/types';

/** Compact action height, then full viewport — drag between snaps. */
const SNAP_POINTS = ['280px', 1] as const;

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
  const hasReposted = !!post.hasReposted;
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  useEffect(() => {
    if (open) setSnap(SNAP_POINTS[0]);
  }, [open]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      snapPoints={[...SNAP_POINTS]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex h-full max-h-[97%] w-full max-w-md flex-col rounded-t-2xl border border-border-custom bg-bg-secondary outline-none"
        >
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border-custom" />
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-custom">
            <Drawer.Title className="text-sm font-semibold text-text-primary">Reshare</Drawer.Title>
            <Drawer.Close asChild>
              <button
                type="button"
                className="p-2 text-text-muted hover:text-text-primary cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Drawer.Close>
          </div>
          <div className="flex-1 overflow-y-auto py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
