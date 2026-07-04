import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Notification } from '@hin/types';
import { NotificationItem } from './NotificationItem';

interface NotificationPanelProps {
  isOpen: boolean;
  notifications: Notification[];
  unreadCount: number;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNotificationClick: (notification: Notification) => void;
  onMarkAllRead: () => void;
}

export function NotificationPanel({
  isOpen,
  notifications,
  unreadCount,
  anchorRef,
  onClose,
  onNotificationClick,
  onMarkAllRead,
}: NotificationPanelProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const panel = document.getElementById('notification-panel-dropdown');
      if (
        anchorRef.current &&
        !anchorRef.current.contains(target) &&
        !panel?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/15 animate-backdrop-fade-in"
        onClick={onClose}
        aria-hidden
      />

      <div
        id="notification-panel-dropdown"
        className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border-custom/80 bg-bg-secondary/95 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.35)] backdrop-blur-xl animate-notification-drop
          top-[calc(3.75rem+env(safe-area-inset-top,0px))]
          right-4
          w-[calc(50vw-1rem)]
          max-h-[50vh]
          origin-top-right
          md:w-[min(20rem,calc(50vw-2rem))]"
        role="dialog"
        aria-label="Notifications"
      >
        <PanelHeader unreadCount={unreadCount} onClose={onClose} onMarkAllRead={onMarkAllRead} />

        <div className="overflow-y-auto divide-y divide-border-custom/40 flex-1 min-h-0">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11px] text-text-muted leading-snug">
              No notifications yet.
            </div>
          ) : (
            notifications.map(n => (
              <NotificationItem
                key={n.id}
                notification={n}
                onClick={() => onNotificationClick(n)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function PanelHeader({
  unreadCount,
  onClose,
  onMarkAllRead,
}: {
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border-custom/50 shrink-0 bg-bg-primary/40">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-text-primary tracking-tight">Notifications</span>
        {unreadCount > 0 && (
          <span className="text-[10px] bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded-full font-semibold leading-none">
            {unreadCount} new
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="px-2 h-7 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-full cursor-pointer transition-colors"
            aria-label="Mark all notifications as read"
          >
            Read all
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer transition-colors"
          aria-label="Dismiss notifications"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
