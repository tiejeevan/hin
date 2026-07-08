import { LogOut, Shield, User } from 'lucide-react';
import { User as UserType, Notification, type GamificationPublic } from '@hin/types';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotificationPanel } from '../notifications/NotificationPanel';
import { UserAvatar } from '../profile/UserAvatar';
import { LevelBadge } from '../gamification/LevelBadge';
import { PointsDisplay } from '../gamification/PointsDisplay';
import { useEffect, useRef, useState } from 'react';

interface AppHeaderProps {
  currentUser: UserType | null;
  showNotifications: boolean;
  unreadNotifsCount: number;
  notifications: Notification[];
  isAdminTab?: boolean;
  onGoHome: () => void;
  onOpenAdmin?: () => void;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  onNotificationClick: (notification: Notification) => void;
  onMarkAllNotificationsRead: (category?: 'social' | 'gamification') => void;
  onOpenProfile: (userId: number) => void;
  onLogout: () => void;
  gamification?: GamificationPublic | null;
  showGamification?: boolean;
  gamificationEnabled?: boolean;
}

export function AppHeader({
  currentUser,
  showNotifications,
  unreadNotifsCount,
  notifications,
  isAdminTab,
  onGoHome,
  onOpenAdmin,
  onToggleNotifications,
  onCloseNotifications,
  onNotificationClick,
  onMarkAllNotificationsRead,
  onOpenProfile,
  onLogout,
  gamification,
  showGamification = false,
  gamificationEnabled = false,
}: AppHeaderProps) {
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-bg-secondary/85 backdrop-blur-md border-b border-border-custom px-4 py-3 flex items-center justify-between transition-colors duration-200 shrink-0">
      <button
        type="button"
        onClick={onGoHome}
        className="cursor-pointer rounded-xl hover:opacity-90 transition-opacity"
        aria-label="Go home"
      >
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-text-primary via-text-secondary to-text-muted">
          Hin
        </span>
      </button>

      {currentUser && (
        <div className="flex items-center gap-3">
          {showGamification && gamification && (gamification.level != null || gamification.totalPoints != null) && (
            <div className="hidden sm:flex items-center gap-2 pr-1 border-r border-border-custom">
              {gamification.level != null && <LevelBadge level={gamification.level} />}
              {gamification.totalPoints != null && <PointsDisplay totalPoints={gamification.totalPoints} compact />}
            </div>
          )}
          {currentUser.role === 'admin' && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                isAdminTab
                  ? 'text-amber-500 bg-amber-500/10'
                  : 'text-amber-500/70 hover:text-amber-400 hover:bg-bg-tertiary'
              }`}
              title="Admin"
              aria-label="Admin"
            >
              <Shield className="h-5 w-5" />
            </button>
          )}

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
              gamificationEnabled={gamificationEnabled}
              anchorRef={bellRef}
              onClose={onCloseNotifications}
              onNotificationClick={onNotificationClick}
              onMarkAllRead={onMarkAllNotificationsRead}
            />
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen(prev => !prev)}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg hover:bg-bg-tertiary transition-colors cursor-pointer"
              aria-label="Account menu"
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
            >
              <UserAvatar
                username={currentUser.username}
                avatarUrl={currentUser.avatarUrl}
                size="sm"
              />
            </button>
            {profileMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-50 min-w-[168px] py-1 rounded-xl border border-border-custom bg-bg-secondary shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onOpenProfile(currentUser.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <User className="h-3.5 w-3.5" />
                  View profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
