interface GuestHeaderProps {
  onSignIn: () => void;
  onGoHome: () => void;
}

export function GuestHeader({ onSignIn, onGoHome }: GuestHeaderProps) {
  return (
    <header role="banner" className="sticky top-0 z-40 bg-bg-secondary/80 backdrop-blur-md border-b border-border-custom px-4 py-3 flex items-center justify-between">
      <button
        type="button"
        onClick={onGoHome}
        className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-text-primary via-text-secondary to-text-muted cursor-pointer"
      >
        Hin
      </button>
      <button
        type="button"
        onClick={onSignIn}
        className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-colors cursor-pointer min-h-[44px]"
      >
        Sign in
      </button>
    </header>
  );
}
