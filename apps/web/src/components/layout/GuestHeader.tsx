import { BrandMark } from './BrandMark';

interface GuestHeaderProps {
  onSignIn: () => void;
  onRegister?: () => void;
  onGoHome: () => void;
}

export function GuestHeader({ onSignIn, onRegister, onGoHome }: GuestHeaderProps) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-40 bg-bg-secondary/85 backdrop-blur-md border-b border-border-custom px-4 py-3 flex items-center justify-between gap-3 shrink-0"
    >
      <button
        type="button"
        onClick={onGoHome}
        className="cursor-pointer rounded-xl hover:opacity-90 transition-opacity min-h-[44px] flex items-center"
        aria-label="Go to public feed"
      >
        <BrandMark size="md" />
      </button>
      <div className="flex items-center gap-2">
        {onRegister && (
          <button
            type="button"
            onClick={onRegister}
            className="text-xs font-semibold text-text-secondary hover:text-text-primary border border-border-custom hover:border-indigo-500/40 px-4 py-2 rounded-xl transition-colors cursor-pointer min-h-[44px]"
          >
            Join free
          </button>
        )}
        <button
          type="button"
          onClick={onSignIn}
          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-colors cursor-pointer min-h-[44px]"
        >
          Sign in
        </button>
      </div>
    </header>
  );
}
