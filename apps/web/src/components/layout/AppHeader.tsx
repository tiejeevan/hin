import { Sparkles, LogOut, Shield } from 'lucide-react';
import { User as UserType, Notification } from '@hin/types';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotificationPanel } from '../notifications/NotificationPanel';
import { UserAvatar } from '../profile/UserAvatar';
import { useRef } from 'react';

interface AppHeaderProps {
  currentUser: UserType | null;
  showNotifications: boolean;
  unreadNotifsCount: number;
  notifications: Notification[];
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  onNotificationClick: (notification: Notification) => void;
  onOpenProfile: (userId: number) => void;
  onLogout: () => void;
}

export function AppHeader({
  currentUser,
  showNotifications,
  unreadNotifsCount,
  notifications,
  onToggleNotifications,
  onCloseNotifications,
  onNotificationClick,
  onOpenProfile,
  onLogout,
}: AppHeaderProps) {
  const bellRef = useRef<HTMLDivElement>(null);

  return (
    <header className="sticky top-0 z-40 bg-bg-secondary/85 backdrop-blur-md border-b border-border-custom px-4 py-3 flex items-center justify-between transition-colors duration-200 shrink-0">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-text-primary via-text-secondary to-text-muted">
          Hin
        </span>
        <span className="text-[10px] bg-bg-tertiary text-text-secondary border border-border-custom px-2 py-0.5 rounded-full font-mono font-medium">
          Secure
        </span>
      </div>

      {currentUser && (
        <div className="flex items-center gap-3">
          <div ref={bellRef} className="relative flex items-center">
            <NotificationBell
              showNotifications={showNotifications}
              unreadCount={unreadNotifsCount}
              onToggle={onToggleNotifications}
            />
            <NotificationPanel
              isOpen={showNotifications}
              notifications={notifications}
              unreadCount={unreadNotifsCount}
              anchorRef={bellRef}
              onClose={onCloseNotifications}
              onNotificationClick={onNotificationClick}
            />
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-border-custom">
            <UserAvatar
              username={currentUser.username}
              avatarUrl={currentUser.avatarUrl}
              size="sm"
              onClick={() => onOpenProfile(currentUser.id)}
            />
            <div className="hidden sm:flex flex-col text-left">
              <button
                type="button"
                onClick={() => onOpenProfile(currentUser.id)}
                className="text-xs font-semibold text-text-primary flex items-center gap-1 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                {currentUser.username}
                {currentUser.role === 'admin' && (
                  <span title="Admin User">
                    <Shield className="h-3 w-3 text-amber-500 fill-amber-500/20" />
                  </span>
                )}
              </button>
              <span className="text-[10px] text-text-muted capitalize">{currentUser.role} Account</span>
            </div>
            <button
              onClick={onLogout}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-rose-400 hover:bg-bg-tertiary transition-colors cursor-pointer"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
