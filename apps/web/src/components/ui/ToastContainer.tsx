import { AtSign, Heart, Megaphone, MessageSquare, MessageCircle, UserPlus, UserCheck } from 'lucide-react';
import { Toast } from '../../types/ui';

interface ToastContainerProps {
  toasts: Toast[];
  onToastClick?: (toast: Toast) => void;
}

export function ToastContainer({ toasts, onToastClick }: ToastContainerProps) {
  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none pb-safe">
      {toasts.map(t => (
        <div
          key={t.id}
          role={onToastClick && (t.postId || t.olabidItemId) ? 'button' : undefined}
          tabIndex={onToastClick && (t.postId || t.olabidItemId) ? 0 : undefined}
          onClick={() => {
            if (onToastClick && (t.postId || t.olabidItemId)) onToastClick(t);
          }}
          onKeyDown={e => {
            if (onToastClick && (t.postId || t.olabidItemId) && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onToastClick(t);
            }
          }}
          className={`bg-bg-secondary/90 text-text-primary border rounded-xl p-3.5 shadow-2xl flex items-center gap-3 animate-pulse-ring max-w-sm pointer-events-auto backdrop-blur-md ${
            t.type === 'system' ? 'border-violet-500/30' : 'border-border-custom'
          } ${onToastClick && (t.postId || t.olabidItemId) ? 'cursor-pointer hover:border-indigo-500/40' : ''}`}
        >
          <div className="shrink-0">
            {t.type === 'like' && (
              <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Heart className="h-4.5 w-4.5 fill-rose-500 text-rose-500" />
              </div>
            )}
            {t.type === 'comment' && (
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <MessageSquare className="h-4.5 w-4.5" />
              </div>
            )}
            {t.type === 'mention' && (
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <AtSign className="h-4.5 w-4.5" />
              </div>
            )}
            {t.type === 'message' && (
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <MessageCircle className="h-4.5 w-4.5" />
              </div>
            )}
            {t.type === 'system' && (
              <div className="h-8 w-8 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
                <Megaphone className="h-4.5 w-4.5" />
              </div>
            )}
            {(t.type === 'follow' || t.type === 'follow_request') && (
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <UserPlus className="h-4.5 w-4.5" />
              </div>
            )}
            {t.type === 'follow_accepted' && (
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <UserCheck className="h-4.5 w-4.5" />
              </div>
            )}
          </div>
          <div className="flex-grow text-left">
            {t.type === 'system' && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400 mb-0.5">
                System
              </p>
            )}
            <p className="text-xs font-medium text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
              {t.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
