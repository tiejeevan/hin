import { Heart, MessageSquare, MessageCircle } from 'lucide-react';
import { Notification } from '@hin/types';

interface NotificationItemProps {
  notification: Notification;
  onClick: () => void;
}

export function NotificationItem({ notification: n, onClick }: NotificationItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3.5 py-2.5 flex gap-2.5 text-left cursor-pointer transition-colors ${
        n.read ? 'hover:bg-bg-tertiary/40' : 'bg-indigo-500/[0.06] hover:bg-indigo-500/10'
      }`}
    >
      <div
        className={`mt-0.5 shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
          n.type === 'like'
            ? 'bg-rose-500/10'
            : n.type === 'comment'
              ? 'bg-indigo-500/10'
              : 'bg-emerald-500/10'
        }`}
      >
        {n.type === 'like' && <Heart className="h-3 w-3 text-rose-500 fill-rose-500" />}
        {n.type === 'comment' && <MessageSquare className="h-3 w-3 text-indigo-400" />}
        {n.type === 'message' && <MessageCircle className="h-3 w-3 text-emerald-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[11px] leading-snug line-clamp-2 ${
            n.read ? 'text-text-secondary' : 'text-text-primary font-medium'
          }`}
        >
          {n.content}
        </p>
        <span className="text-[10px] text-text-muted mt-1 block leading-none">
          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {!n.read && (
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 self-center shrink-0" aria-hidden />
      )}
    </button>
  );
}
