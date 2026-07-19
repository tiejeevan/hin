import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, ChevronRight } from 'lucide-react';
import { API_URL, TURNSTILE_SITE_KEY } from '../../config';
import { TurnstileWidget, type TurnstileWidgetHandle } from './TurnstileWidget';

type Step = 'identify' | 'code' | 'done';

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [turnstileEnabledSetting, setTurnstileEnabledSetting] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/turnstile-config`);
        if (!res.ok) return;
        const data = (await res.json()) as { turnstileEnabled: boolean };
        if (!cancelled) setTurnstileEnabledSetting(data.turnstileEnabled);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnstileRequired = !!TURNSTILE_SITE_KEY && turnstileEnabledSetting;
  const looksLikeEmail = identifier.includes('@');

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (turnstileRequired && !turnstileToken) {
      setError('Please complete the verification challenge');
      return;
    }
    setBusy(true);
    try {
      const body = looksLikeEmail
        ? { email: identifier.trim(), turnstileToken: turnstileToken ?? undefined }
        : { username: identifier.trim(), turnstileToken: turnstileToken ?? undefined };
      const res = await fetch(`${API_URL}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Request failed');
      }
      setInfo(
        'If an account with a verified email matches, we sent a 6-digit code. Check your inbox.',
      );
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    } finally {
      setBusy(false);
    }
  };

  const verifyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const body = looksLikeEmail
        ? { email: identifier.trim(), code: code.trim(), newPassword }
        : { username: identifier.trim(), code: code.trim(), newPassword };
      const res = await fetch(`${API_URL}/api/auth/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Reset failed');
      }
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 bg-radial from-indigo-900/10 via-transparent to-transparent">
      <div className="max-w-md w-full bg-bg-secondary border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px] mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-indigo-600/10 text-indigo-400 items-center justify-center mb-3">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">
            {step === 'done' ? 'Password updated' : 'Reset password'}
          </h2>
          <p className="text-xs text-text-muted mt-2">
            {step === 'identify' && 'Enter your username or verified email'}
            {step === 'code' && 'Enter the 6-digit code and choose a new password'}
            {step === 'done' && 'Sign in with your new password'}
          </p>
        </div>

        {(error || info) && (
          <div
            className={`mb-4 border text-xs px-3.5 py-2.5 rounded-xl text-left ${
              error
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}
          >
            {error || info}
          </div>
        )}

        {step === 'identify' && (
          <form onSubmit={requestReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Username or email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
                placeholder="username or you@example.com"
              />
            </div>
            {turnstileRequired && (
              <TurnstileWidget
                ref={turnstileRef}
                onToken={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
              />
            )}
            <button
              type="submit"
              disabled={busy || (turnstileRequired && !turnstileToken)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              {busy ? 'Please wait...' : 'Send reset code'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                6-digit code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary tracking-[0.35em] focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                New password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              {busy ? 'Please wait...' : 'Set new password'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 'done' && (
          <button
            type="button"
            onClick={onBack}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 cursor-pointer min-h-[44px]"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
