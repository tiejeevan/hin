import { Home, Shield, Users, ChevronRight } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { ActiveTab } from '../../types/ui';

interface SidebarProps {
  activeTab: ActiveTab;
  currentUser: UserType;
  users: UserType[];
  onlineUserIds: number[];
  chatRecipient: { id: number } | null;
  onGoHome: () => void;
  onOpenAdmin: () => void;
  onStartChat: (user: UserType) => void;
}

export function Sidebar({
  activeTab,
  currentUser,
  users,
  onlineUserIds,
  chatRecipient,
  onGoHome,
  onOpenAdmin,
  onStartChat,
}: SidebarProps) {
  const navBtnClass = (active: boolean, accent?: 'indigo' | 'amber') => {
    if (active) {
      return accent === 'amber'
        ? 'bg-amber-600 text-white font-medium shadow-lg shadow-amber-600/20'
        : 'bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-600/20';
    }
    return accent === 'amber'
      ? 'text-amber-500/80 hover:text-amber-400 hover:bg-bg-tertiary'
      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary';
  };

  return (
    <aside className="w-80 border-r border-border-custom hidden md:flex flex-col p-4 gap-4 shrink-0 bg-bg-secondary">
      <div className="flex flex-col gap-1">
        <button
          onClick={onGoHome}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer min-h-[44px] ${navBtnClass(activeTab === 'feed')}`}
        >
          <Home className="h-5 w-5" />
          <span>Home</span>
        </button>

        {currentUser.role === 'admin' && (
          <button
            onClick={onOpenAdmin}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer min-h-[44px] ${navBtnClass(activeTab === 'admin', 'amber')}`}
          >
            <Shield className="h-5 w-5" />
            <span>Admin</span>
          </button>
        )}
      </div>

      <div className="flex-grow flex flex-col min-h-0 bg-bg-tertiary/30 rounded-2xl border border-border-custom p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary px-2 pb-3 border-b border-border-custom">
          <Users className="h-4 w-4" />
          <span>Active Users ({users.length})</span>
        </div>
        <div className="flex-grow overflow-y-auto mt-2 space-y-1">
          {users.map(u => {
            const isSelf = u.id === currentUser.id;
            const isOnline = onlineUserIds.includes(u.id);
            return (
              <div
                key={u.id}
                onClick={() => !isSelf && onStartChat(u)}
                className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors text-left min-h-[44px] ${
                  isSelf
                    ? 'bg-bg-tertiary/20 opacity-70 cursor-default'
                    : 'cursor-pointer hover:bg-bg-tertiary'
                } ${chatRecipient?.id === u.id ? 'bg-bg-tertiary' : ''}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative">
                    <div className="h-8 w-8 rounded-full bg-bg-tertiary border border-border-custom flex items-center justify-center font-bold text-xs uppercase text-text-secondary">
                      {u.username[0]}
                    </div>
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-bg-secondary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate flex items-center gap-1">
                      @{u.username}
                      {isSelf && <span className="text-[10px] text-text-muted font-normal">(you)</span>}
                      {u.role === 'admin' && <Shield className="h-3 w-3 text-amber-500" />}
                    </p>
                    <p className="text-[9px] text-text-muted">{isOnline ? 'Online' : 'Offline'}</p>
                  </div>
                </div>
                {!isSelf && <ChevronRight className="h-3 w-3 text-text-muted" />}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
