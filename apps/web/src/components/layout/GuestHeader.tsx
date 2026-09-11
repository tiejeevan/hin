import { HeaderBrandCluster } from './HeaderBrandCluster';

interface GuestHeaderProps {
  onSignIn: () => void;
  onRegister?: () => void;
  onGoHome: () => void;
  onlineCount?: number;
}

const guestActionClass =
  'inline-flex items-center justify-center h-9 px-3.5 text-sm font-semibold leading-none rounded-lg transition-colors cursor-pointer';

export function GuestHeader({ onSignIn, onRegister, onGoHome, onlineCount }: GuestHeaderProps) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-40 h-14 px-4 flex items-center justify-between gap-4 bg-bg-secondary/85 backdrop-blur-md border-b border-border-custom shrink-0"
    >
      <HeaderBrandCluster
        onGoHome={onGoHome}
        homeAriaLabel="Go to public feed"
        onlineCount={onlineCount}
      />
      <div className="flex items-center gap-2 shrink-0">
        {onRegister && (
          <button
            type="button"
            onClick={onRegister}
            className={`${guestActionClass} text-text-secondary hover:text-text-primary border border-border-custom hover:border-indigo-500/40`}
          >
            Sign up
          </button>
        )}
        <button
          type="button"
          onClick={onSignIn}
          className={`${guestActionClass} bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20`}
        >
          Sign in
        </button>
      </div>
    </header>
  );
}
