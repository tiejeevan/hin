import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { GOOGLE_CLIENT_ID, TURNSTILE_SITE_KEY, API_URL } from '../../config';
import { AuthLogoAnimation } from './AuthLogoAnimation';
import { GoogleSignInButton } from './GoogleSignInButton';
import { TurnstileWidget, type TurnstileWidgetHandle } from './TurnstileWidget';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { UsernameField } from './UsernameField';

interface AuthFormProps {
  /** When true, renders only the card (for AuthLanding split layout). */
  embedded?: boolean;
  isRegisterMode: boolean;
  usernameInput: string;
  emailInput: string;
  passwordInput: string;
  authError: string | null;
  isAuthLoading: boolean;
  onSubmit: (e: React.FormEvent, turnstileToken?: string) => void;
  onUsernameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMode: () => void;
  onGoogleCredential?: (credential: string) => void;
}

export function AuthForm({
  embedded = false,
  isRegisterMode,
  usernameInput,
  emailInput,
  passwordInput,
  authError,
  isAuthLoading,
  onSubmit,
  onUsernameChange,
  onEmailChange,
  onPasswordChange,
  onToggleMode,
  onGoogleCredential,
}: AuthFormProps) {
  const showGoogleSignIn = !!GOOGLE_CLIENT_ID && !!onGoogleCredential;
  const [turnstileEnabledSetting, setTurnstileEnabledSetting] = useState(false);
  const [strictPassword, setStrictPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/turnstile-config`);
        if (!res.ok) throw new Error();
        const data = await res.json() as {
          turnstileEnabled: boolean;
          strictPasswordRequirements?: boolean;
        };
        if (!cancelled) {
          setTurnstileEnabledSetting(data.turnstileEnabled);
          setStrictPassword(!!data.strictPasswordRequirements);
        }
      } catch {
        // Fallback to disabled
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnstileRequired = !!TURNSTILE_SITE_KEY && turnstileEnabledSetting;
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  useEffect(() => {
    if (authError) {
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    }
  }, [authError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (turnstileRequired && !turnstileToken) {
      setTurnstileError('Please complete the verification challenge');
      return;
    }
    setTurnstileError(null);
    onSubmit(e, turnstileToken ?? undefined);
  };

  if (forgotMode) {
    return <ForgotPasswordForm onBack={() => setForgotMode(false)} />;
  }

  const passwordHint = isRegisterMode
    ? (strictPassword
      ? 'At least 8 characters with 3 of: upper, lower, number, symbol'
      : 'Any password with at least 1 character')
    : null;

  const canSubmit = isRegisterMode
    ? usernameInput.trim().length > 0 && emailInput.trim().length > 0 && passwordInput.trim().length > 0
    : usernameInput.trim().length > 0 && passwordInput.trim().length > 0;

  const card = (
      <div className="max-w-md w-full bg-bg-secondary border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <div className="text-center mb-6">
          <AuthLogoAnimation size="compact" className="mb-1" />
          <h2 className="text-2xl font-bold text-text-primary">
            {isRegisterMode ? 'Create Account' : 'Welcome Back'}
          </h2>
        </div>

        {showGoogleSignIn && (
          <div className="mb-5 space-y-4">
            <GoogleSignInButton
              onCredential={onGoogleCredential}
              disabled={isAuthLoading}
            />
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border-custom" />
              <span className="text-[11px] font-medium text-text-muted">or continue with email</span>
              <div className="h-px flex-1 bg-border-custom" />
            </div>
          </div>
        )}

        {(authError || turnstileError) && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-3.5 py-2.5 rounded-xl text-left">
            {authError || turnstileError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegisterMode ? (
            <UsernameField
              value={usernameInput}
              onChange={onUsernameChange}
              disabled={isAuthLoading}
            />
          ) : (
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Username or email</label>
              <input
                type="text"
                required
                autoComplete="username"
                placeholder="Email or username"
                value={usernameInput}
                onChange={e => onUsernameChange(e.target.value)}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
              />
            </div>
          )}

          {isRegisterMode && (
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="Email"
                value={emailInput}
                onChange={e => onEmailChange(e.target.value)}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <label className="block text-xs font-semibold text-text-secondary">Password</label>
              {!isRegisterMode && (
                <button
                  type="button"
                  onClick={() => setForgotMode(true)}
                  className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={passwordInput}
              onChange={e => onPasswordChange(e.target.value)}
              className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
            />
            {passwordHint && (
              <p className="mt-1.5 text-[10px] text-text-muted">{passwordHint}</p>
            )}
          </div>

          {turnstileRequired && (
            <TurnstileWidget
              ref={turnstileRef}
              onToken={(token) => {
                setTurnstileToken(token);
                setTurnstileError(null);
              }}
              onExpire={() => setTurnstileToken(null)}
            />
          )}
          <button
            type="submit"
            disabled={isAuthLoading || !canSubmit || (turnstileRequired && !turnstileToken)}
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
  );

  if (embedded) {
    return card;
  }

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 bg-radial from-indigo-900/10 via-transparent to-transparent">
      {card}
    </div>
  );
}
