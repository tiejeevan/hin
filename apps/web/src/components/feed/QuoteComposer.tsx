import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Post } from '@hin/types';
import { isUnavailableRepostedPost } from '@hin/types';
import { PostContentText } from './PostContentText';
import { UserAvatar } from '../profile/UserAvatar';

interface QuoteComposerProps {
  original: Post;
  open: boolean;
  maxLength: number;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (content: string) => void;
  onViewProfile: (userIdOrUsername: number | string) => void;
}

export function QuoteComposer({
  original,
  open,
  maxLength,
  submitting = false,
  onClose,
  onSubmit,
  onViewProfile,
}: QuoteComposerProps) {
  const [content, setContent] = useState('');

  useEffect(() => {
    if (open) setContent('');
  }, [open, original.id]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = content.trim();
  const over = content.length > maxLength;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 animate-backdrop-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Quote post"
        className="relative w-full sm:max-w-lg bg-bg-secondary border border-border-custom rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-panel-pop-anchor"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-custom">
          <h2 className="text-sm font-semibold text-text-primary">Quote post</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <textarea
            rows={4}
            autoFocus
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={maxLength}
            placeholder="Add your commentary…"
            className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />
          <div className="flex justify-end">
            <span className={`text-[10px] ${over ? 'text-rose-400' : 'text-text-muted'}`}>
              {content.length}/{maxLength}
            </span>
          </div>

          <div className="rounded-xl border border-border-custom bg-bg-primary/40 p-3 space-y-2">
            {isUnavailableRepostedPost(original as any) ? (
              <p className="text-xs text-text-muted">Original post unavailable</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <UserAvatar
                    username={original.username}
                    avatarUrl={original.authorAvatarUrl}
                    size="sm"
                    onClick={() => onViewProfile(original.username)}
                  />
                  <button
                    type="button"
                    onClick={() => onViewProfile(original.username)}
                    className="text-xs font-semibold text-text-primary hover:underline cursor-pointer"
                  >
                    @{original.username}
                  </button>
                </div>
                <PostContentText
                  content={original.content}
                  onViewProfile={onViewProfile}
                  className="text-xs text-text-secondary line-clamp-4"
                />
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-custom">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-text-muted hover:text-text-primary px-3 py-2 cursor-pointer min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed || over || submitting}
            onClick={() => onSubmit(trimmed)}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer min-h-[44px]"
          >
            {submitting ? 'Posting…' : 'Post quote'}
          </button>
        </div>
      </div>
    </div>
  );
}
