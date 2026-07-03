import { Shield } from 'lucide-react';
import { User as UserType } from '@hin/types';

interface ImpersonationBannerProps {
  adminUser: UserType;
  currentUsername: string;
  onStopImpersonating: () => void;
}

export function ImpersonationBanner({
  adminUser,
  currentUsername,
  onStopImpersonating,
}: ImpersonationBannerProps) {
  return (
    <div className="bg-amber-600 text-slate-950 font-bold px-4 py-2.5 text-center text-xs flex items-center justify-center gap-3 shrink-0 select-none shadow-md z-50">
      <span className="flex items-center gap-1.5">
        <Shield className="h-4 w-4 fill-slate-950" />
        You are currently acting as <strong className="underline font-mono">@{currentUsername}</strong> (Delegated by @{adminUser.username})
      </span>
      <button
        onClick={onStopImpersonating}
        className="bg-slate-950 text-amber-500 hover:text-amber-400 font-bold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-colors cursor-pointer min-h-[44px]"
      >
        Return to Admin
      </button>
    </div>
  );
}
