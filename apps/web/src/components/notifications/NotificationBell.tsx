import { Bell } from 'lucide-react';

interface NotificationBellProps {
  showNotifications: boolean;
  unreadCount: number;
  onToggle: () => void;
}

export function NotificationBell({ showNotifications, unreadCount, onToggle }: NotificationBellProps) {
  return (
    <button
      id="notifications-bell-trigger"
      onClick={onToggle}
      className={`relative h-10 w-10 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer ${
        showNotifications
          ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30 shadow-sm shadow-indigo-500/10'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80 active:scale-95'
      }`}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      aria-expanded={showNotifications}
    >
      <Bell
        className={`h-[18px] w-[18px] transition-transform duration-200 ${showNotifications ? 'scale-105' : ''}`}
        strokeWidth={showNotifications ? 2.25 : 2}
      />
      {unreadCount > 0 && (
        <span className="absolute top-0.5 right-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-bg-secondary">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
