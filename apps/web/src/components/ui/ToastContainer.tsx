import { Heart, MessageSquare, MessageCircle, Sparkles } from 'lucide-react';
import { Toast } from '../../types/ui';

interface ToastContainerProps {
  toasts: Toast[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none pb-safe">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-bg-secondary/90 text-text-primary border border-border-custom rounded-xl p-3.5 shadow-2xl flex items-center gap-3 animate-pulse-ring max-w-sm pointer-events-auto backdrop-blur-md"
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
            {t.type === 'message' && (
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <MessageCircle className="h-4.5 w-4.5" />
              </div>
            )}
            {t.type === 'system' && (
              <div className="h-8 w-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
            )}
          </div>
          <div className="flex-grow text-left">
            <p className="text-xs font-medium text-text-secondary leading-relaxed">{t.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
