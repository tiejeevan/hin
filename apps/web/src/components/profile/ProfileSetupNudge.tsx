import { User } from 'lucide-react';

interface ProfileSetupNudgeProps {
  onContinue: () => void;
  onDismiss: () => void;
}

/** Soft banner nudging incomplete profiles to finish basics or resume the tour. */
export function ProfileSetupNudge({ onContinue, onDismiss }: ProfileSetupNudgeProps) {
  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
          <User className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">Finish setting up your profile</p>
          <p className="text-xs text-text-muted mt-0.5">
            Add your name and birthday so others can know you. Takes a minute.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-secondary transition-colors cursor-pointer min-h-[44px]"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer min-h-[44px]"
        >
          Continue setup
        </button>
      </div>
    </div>
  );
}
