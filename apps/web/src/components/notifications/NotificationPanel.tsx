import { useEffect, useMemo, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { Notification, isGamificationNotification, resolveNotificationCategory } from '@hin/types';
import { NotificationItem } from './NotificationItem';

type InboxTab = 'social' | 'gamification';

interface NotificationPanelProps {
  isOpen: boolean;
  notifications: Notification[];
  unreadCount: number;
  gamificationEnabled: boolean;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNotificationClick: (notification: Notification) => void;
  onMarkAllRead: (category?: InboxTab) => void;
}

export function NotificationPanel({
  isOpen,
  notifications,
  unreadCount,
  gamificationEnabled,
  anchorRef,
  onClose,
  onNotificationClick,
  onMarkAllRead,
}: NotificationPanelProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>('social');

  const socialNotifications = useMemo(
    () => notifications.filter(n => resolveNotificationCategory(n) === 'social'),
    [notifications],
  );
  const systemNotifications = useMemo(
    () => notifications.filter(n => isGamificationNotification(n)),
    [notifications],
  );

  const socialUnread = socialNotifications.filter(n => !n.read).length;
  const systemUnread = systemNotifications.filter(n => !n.read).length;

  const visibleNotifications = activeTab === 'gamification' ? systemNotifications : socialNotifications;
  const tabUnread = activeTab === 'gamification' ? systemUnread : socialUnread;

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

  useEffect(() => {
    if (!gamificationEnabled && activeTab === 'gamification') {
      setActiveTab('social');
    }
  }, [gamificationEnabled, activeTab]);

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
          w-[calc(80vw-1rem)]
          max-h-[50vh]
          origin-top-right"
        role="dialog"
        aria-label="Notifications"
      >
        <PanelHeader
          unreadCount={unreadCount}
          onClose={onClose}
          onMarkAllRead={() => onMarkAllRead(gamificationEnabled ? activeTab : undefined)}
          tabUnread={tabUnread}
        />

        {gamificationEnabled && (
          <div className="flex border-b border-border-custom/50 shrink-0 bg-bg-primary/30 px-2 pt-1">
            <TabButton
              active={activeTab === 'social'}
              label="Activity"
              unread={socialUnread}
              onClick={() => setActiveTab('social')}
            />
            <TabButton
              active={activeTab === 'gamification'}
              label="System"
              unread={systemUnread}
              onClick={() => setActiveTab('gamification')}
            />
          </div>
        )}

        <div className="overflow-y-auto divide-y divide-border-custom/40 flex-1 min-h-0">
          {visibleNotifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11px] text-text-muted leading-snug">
              {activeTab === 'gamification'
                ? 'No system notifications yet.'
                : 'No notifications yet.'}
            </div>
          ) : (
            visibleNotifications.map(n => (
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

function TabButton({
  active,
  label,
  unread,
  onClick,
}: {
  active: boolean;
  label: string;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 px-2 py-2 text-[11px] font-medium transition-colors cursor-pointer rounded-t-lg ${
        active
          ? 'text-text-primary bg-bg-secondary/80'
          : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/40'
      }`}
      aria-pressed={active}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        {label === 'System' && <Trophy className="h-3 w-3 text-amber-400/90" aria-hidden />}
        {label}
        {unread > 0 && (
          <span className="text-[9px] bg-indigo-500/15 text-indigo-400 px-1 py-0.5 rounded-full font-semibold leading-none min-w-[1rem] text-center">
            {unread}
          </span>
        )}
      </span>
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-400/80" aria-hidden />
      )}
    </button>
  );
}

function PanelHeader({
  unreadCount,
  tabUnread,
  onClose,
  onMarkAllRead,
}: {
  unreadCount: number;
  tabUnread: number;
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
        {tabUnread > 0 && (
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
