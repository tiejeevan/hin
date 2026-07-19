import { Mail } from 'lucide-react';

interface EmailVerifyNudgeProps {
  onVerifyClick: () => void;
}

/** Soft banner for password accounts that still need a verified recovery email. */
export function EmailVerifyNudge({ onVerifyClick }: EmailVerifyNudgeProps) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">Add a recovery email</p>
          <p className="text-xs text-text-muted mt-0.5">
            Verify an email so you can reset your password if you get locked out.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onVerifyClick}
        className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer min-h-[44px]"
      >
        Verify email
      </button>
    </div>
  );
}
