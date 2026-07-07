import { AtSign, Heart, Megaphone, MessageSquare, MessageCircle, UserPlus, UserCheck, Award, TrendingUp } from 'lucide-react';
import { Notification } from '@hin/types';

interface NotificationItemProps {
  notification: Notification;
  onClick: () => void;
}

function iconForType(type: Notification['type']) {
  switch (type) {
    case 'like':
      return <Heart className="h-3 w-3 text-rose-500 fill-rose-500" />;
    case 'comment':
      return <MessageSquare className="h-3 w-3 text-indigo-400" />;
    case 'mention':
      return <AtSign className="h-3 w-3 text-violet-400" />;
    case 'message':
      return <MessageCircle className="h-3 w-3 text-emerald-400" />;
    case 'system':
      return <Megaphone className="h-3 w-3 text-violet-400" />;
    case 'follow':
    case 'follow_request':
      return <UserPlus className="h-3 w-3 text-sky-400" />;
    case 'follow_accepted':
      return <UserCheck className="h-3 w-3 text-emerald-400" />;
    case 'badge_award':
      return <Award className="h-3 w-3 text-amber-400" />;
    case 'level_up':
      return <TrendingUp className="h-3 w-3 text-violet-400" />;
    default:
      return <MessageSquare className="h-3 w-3 text-indigo-400" />;
  }
}

function bgForType(type: Notification['type']) {
  switch (type) {
    case 'like':
      return 'bg-rose-500/10';
    case 'comment':
      return 'bg-indigo-500/10';
    case 'mention':
      return 'bg-violet-500/10';
    case 'message':
      return 'bg-emerald-500/10';
    case 'system':
      return 'bg-violet-500/15';
    case 'follow':
    case 'follow_request':
      return 'bg-sky-500/10';
    case 'follow_accepted':
      return 'bg-emerald-500/10';
    case 'badge_award':
      return 'bg-amber-500/15';
    case 'level_up':
      return 'bg-violet-500/15';
    default:
      return 'bg-emerald-500/10';
  }
}

export function NotificationItem({ notification: n, onClick }: NotificationItemProps) {
  return (
    <button
      type="button"
      data-notification-item
      onClick={onClick}
      className={`w-full px-3.5 py-2.5 flex gap-2.5 text-left cursor-pointer transition-colors ${
        n.read
          ? 'hover:bg-bg-tertiary/40'
          : n.type === 'system'
            ? 'bg-violet-500/[0.08] hover:bg-violet-500/10'
            : 'bg-indigo-500/[0.06] hover:bg-indigo-500/10'
      }`}
    >
      <div className={`mt-0.5 shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${bgForType(n.type)}`}>
        {iconForType(n.type)}
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
          {n.type === 'system' ? 'System · ' : n.type === 'badge_award' ? 'Badge · ' : n.type === 'level_up' ? 'Level · ' : ''}
          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {!n.read && (
        <span
          className={`h-1.5 w-1.5 rounded-full self-center shrink-0 ${
            n.type === 'system' ? 'bg-violet-500' : 'bg-indigo-500'
          }`}
          aria-hidden
        />
      )}
    </button>
  );
}
