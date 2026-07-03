import { Shield } from 'lucide-react';
import { ActiveTab } from '../../types/ui';
import { User as UserType } from '@hin/types';

interface BottomNavProps {
  activeTab: ActiveTab;
  currentUser: UserType;
  onOpenAdmin: () => void;
}

export function BottomNav({ activeTab, currentUser, onOpenAdmin }: BottomNavProps) {
  if (currentUser.role !== 'admin') return null;

  return (
    <nav className="sticky bottom-0 z-30 md:hidden bg-bg-secondary border-t border-border-custom px-2 pt-2 pb-safe flex items-center justify-center shrink-0 select-none">
      <button
        onClick={onOpenAdmin}
        className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl transition-all cursor-pointer ${
          activeTab === 'admin' ? 'text-amber-500' : 'text-amber-500/50'
        }`}
        aria-label="Admin"
      >
        <Shield className="h-6 w-6" />
      </button>
    </nav>
  );
}
