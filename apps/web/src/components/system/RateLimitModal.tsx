import { useEffect, useRef, useState } from 'react';
import { API_URL, TURNSTILE_SITE_KEY } from '../../config';
import { formatRetryCountdown, type RateLimitBlockState } from '../../lib/rateLimitResponse';
import { TurnstileWidget, type TurnstileWidgetHandle } from '../auth/TurnstileWidget';

interface RateLimitModalProps {
  state: RateLimitBlockState;
  token: string | null;
  onDismiss: () => void;
  onUnlocked: () => void;
}

export function RateLimitModal({ state, token, onDismiss, onUnlocked }: RateLimitModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(state.retryAfterSeconds ?? 0);
  const [turnstileEnabledSetting, setTurnstileEnabledSetting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  useEffect(() => {
    const initial = state.retryAfterSeconds ?? 0;
    setSecondsLeft(initial);
    if (initial <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.retryAfterSeconds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/turnstile-config`);
        if (!res.ok) return;
        const data = (await res.json()) as { turnstileEnabled?: boolean };
        if (!cancelled) setTurnstileEnabledSetting(!!data.turnstileEnabled);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnstileRequired = !!TURNSTILE_SITE_KEY && turnstileEnabledSetting;

  const unlock = async () => {
    setActionError(null);
    if (turnstileRequired && !turnstileToken) {
      setActionError('Complete the verification challenge to continue.');
      return;
    }
    setBusy(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/auth/rate-limit-unlock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ turnstileToken: turnstileToken ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(
          (data as { error?: string }).error || 'Could not verify. Please try again.',
        );
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }
      onUnlocked();
    } catch {
      setActionError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-bg-secondary p-5 shadow-xl">
        <h2 className="text-lg font-bold text-text-primary">Too many requests</h2>
        <p className="text-sm text-text-secondary mt-2">{state.error}</p>
        {secondsLeft > 0 && (
          <p className="text-sm text-text-muted mt-3">
            You can try again automatically in{' '}
            <span className="font-semibold text-amber-400">{formatRetryCountdown(secondsLeft)}</span>
            , or verify below to continue now.
          </p>
        )}
        {actionError && (
          <p className="text-sm text-rose-400 mt-3" role="alert">
            {actionError}
          </p>
        )}
        {turnstileRequired && (
          <div className="mt-4 flex justify-center">
            <TurnstileWidget
              ref={turnstileRef}
              onToken={(t) => {
                setTurnstileToken(t);
                setActionError(null);
              }}
              onExpire={() => setTurnstileToken(null)}
            />
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || (turnstileRequired && !turnstileToken)}
            onClick={() => void unlock()}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {turnstileRequired ? 'Verify and continue' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-lg border border-border-custom py-2.5 text-sm font-medium text-text-secondary cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
