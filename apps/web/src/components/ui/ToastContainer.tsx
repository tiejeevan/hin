import { useEffect, useRef, useState } from 'react';
import {
  AtSign,
  Award,
  Heart,
  Megaphone,
  MessageSquare,
  MessageCircle,
  TrendingUp,
  UserPlus,
  UserCheck,
  X,
} from 'lucide-react';
import { Toast } from '../../types/ui';

const SWIPE_DISMISS_PX = 80;
const DRAG_DEADZONE_PX = 10;

interface ToastContainerProps {
  toasts: Toast[];
  onToastClick?: (toast: Toast) => void;
  onDismiss: (id: string) => void;
}

interface ToastItemProps {
  toast: Toast;
  onToastClick?: (toast: Toast) => void;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onToastClick, onDismiss }: ToastItemProps) {
  const [remainingMs, setRemainingMs] = useState(toast.duration);
  const [paused, setPaused] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const pausedRef = useRef(false);
  const remainingRef = useRef(toast.duration);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const pointerStartXRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const didDragRef = useRef(false);
  const draggingRef = useRef(false);
  const offsetXRef = useRef(0);
  const verticalGestureRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const setPausedBoth = (value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
  };

  remainingRef.current = remainingMs;
  offsetXRef.current = offsetX;

  const hasNavTarget = Boolean(toast.postId || toast.olabidItemId || toast.retryKey);
  const progress = Math.max(0, Math.min(1, remainingMs / toast.duration));

  useEffect(() => {
    const tick = (now: number) => {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      if (!pausedRef.current) {
        const next = Math.max(0, remainingRef.current - delta);
        remainingRef.current = next;
        setRemainingMs(next);
        if (next <= 0) {
          onDismissRef.current(toast.id);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [toast.id]);

  const handleActivate = () => {
    if (didDragRef.current) return;
    if (hasNavTarget && onToastClick) {
      onToastClick(toast);
      onDismiss(toast.id);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    didDragRef.current = false;
    verticalGestureRef.current = false;
    draggingRef.current = true;
    pointerStartXRef.current = e.clientX;
    pointerStartYRef.current = e.clientY;
    setDragging(true);
    setPausedBoth(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - pointerStartXRef.current;
    const dy = e.clientY - pointerStartYRef.current;

    if (!didDragRef.current && !verticalGestureRef.current) {
      if (Math.abs(dy) > DRAG_DEADZONE_PX && Math.abs(dy) > Math.abs(dx)) {
        verticalGestureRef.current = true;
        return;
      }
      if (Math.abs(dx) > DRAG_DEADZONE_PX) {
        didDragRef.current = true;
      }
    }

    if (verticalGestureRef.current) return;
    if (didDragRef.current) {
      offsetXRef.current = dx;
      setOffsetX(dx);
    }
  };

  const finishPointer = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);

    if (didDragRef.current && Math.abs(offsetXRef.current) >= SWIPE_DISMISS_PX) {
      onDismiss(toast.id);
      return;
    }

    offsetXRef.current = 0;
    setOffsetX(0);
    setPausedBoth(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      style={{
        transform: `translateX(${offsetX}px)`,
        transition: dragging ? 'none' : 'transform 0.2s ease-out',
        opacity: Math.max(0.35, 1 - Math.abs(offsetX) / (SWIPE_DISMISS_PX * 2)),
        touchAction: 'none',
      }}
      className={`relative overflow-hidden bg-bg-secondary/90 text-text-primary border rounded-xl p-3.5 pr-8 shadow-2xl flex items-center gap-3 max-w-sm pointer-events-auto backdrop-blur-md cursor-pointer select-none ${
        toast.type === 'system' ? 'border-violet-500/30' : 'border-border-custom'
      } ${hasNavTarget ? 'hover:border-indigo-500/40' : ''}`}
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={e => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        onPointerDown={e => e.stopPropagation()}
        className="absolute top-2 right-2 p-0.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-primary/60 transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="shrink-0">
        {toast.type === 'like' && (
          <div className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <Heart className="h-4.5 w-4.5 fill-rose-500 text-rose-500" />
          </div>
        )}
        {toast.type === 'comment' && (
          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <MessageSquare className="h-4.5 w-4.5" />
          </div>
        )}
        {toast.type === 'mention' && (
          <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
            <AtSign className="h-4.5 w-4.5" />
          </div>
        )}
        {toast.type === 'message' && (
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <MessageCircle className="h-4.5 w-4.5" />
          </div>
        )}
        {toast.type === 'system' && (
          <div className="h-8 w-8 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
            <Megaphone className="h-4.5 w-4.5" />
          </div>
        )}
        {(toast.type === 'follow' || toast.type === 'follow_request') && (
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <UserPlus className="h-4.5 w-4.5" />
          </div>
        )}
        {toast.type === 'follow_accepted' && (
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <UserCheck className="h-4.5 w-4.5" />
          </div>
        )}
        {toast.type === 'badge_award' && (
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Award className="h-4.5 w-4.5" />
          </div>
        )}
        {toast.type === 'level_up' && (
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
        )}
      </div>

      <div className="flex-grow text-left min-w-0">
        {toast.type === 'system' && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400 mb-0.5">
            System
          </p>
        )}
        <p className="text-xs font-medium text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
          {toast.content}
        </p>
      </div>

      <div
        className={`absolute bottom-0 left-0 h-0.5 transition-[opacity] ${
          toast.type === 'system' ? 'bg-violet-400' : 'bg-indigo-400'
        } ${paused ? 'opacity-40' : 'opacity-90'}`}
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

export function ToastContainer({ toasts, onToastClick, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none pb-safe">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onToastClick={onToastClick} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
