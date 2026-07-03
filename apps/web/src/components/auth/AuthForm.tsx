import { Lock, ChevronRight } from 'lucide-react';

interface AuthFormProps {
  isRegisterMode: boolean;
  usernameInput: string;
  passwordInput: string;
  authError: string | null;
  isAuthLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMode: () => void;
}

export function AuthForm({
  isRegisterMode,
  usernameInput,
  passwordInput,
  authError,
  isAuthLoading,
  onSubmit,
  onUsernameChange,
  onPasswordChange,
  onToggleMode,
}: AuthFormProps) {
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 bg-radial from-indigo-900/10 via-transparent to-transparent">
      <div className="max-w-md w-full bg-bg-secondary border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-indigo-600/10 text-indigo-400 items-center justify-center mb-3">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">
            {isRegisterMode ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-xs text-text-muted mt-2">
            {isRegisterMode
              ? 'Register a secure username and password'
              : 'Sign in to access secure real-time messaging'}
          </p>
        </div>

        {authError && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-3.5 py-2.5 rounded-xl text-left">
            {authError}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Username</label>
            <input
              type="text"
              required
              placeholder="Enter username"
              value={usernameInput}
              onChange={e => onUsernameChange(e.target.value)}
              className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={passwordInput}
              onChange={e => onPasswordChange(e.target.value)}
              className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            disabled={isAuthLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            {isAuthLoading ? 'Please wait...' : isRegisterMode ? 'Register Account' : 'Sign In'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={onToggleMode}
            className="text-xs text-indigo-400 hover:underline cursor-pointer min-h-[44px] px-2"
          >
            {isRegisterMode ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
