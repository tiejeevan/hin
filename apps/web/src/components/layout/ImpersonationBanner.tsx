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
    <div className="bg-amber-600 text-slate-950 font-bold px-3 py-2 text-xs shrink-0 select-none shadow-md z-50">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 min-w-0">
        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full text-center leading-snug">
          <Shield className="h-3.5 w-3.5 fill-slate-950 shrink-0" />
          <span className="min-w-0 break-words">
            Acting as{' '}
            <strong className="underline font-mono">@{currentUsername}</strong>
            <span className="font-semibold opacity-80">
              {' '}
              · @{adminUser.username}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={onStopImpersonating}
          className="shrink-0 bg-slate-950 text-amber-500 hover:text-amber-400 font-bold px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider transition-colors cursor-pointer min-h-[36px]"
        >
          Return to Admin
        </button>
      </div>
    </div>
  );
}
