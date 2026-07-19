import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import type { MeEmailStatus, User } from '@hin/types';
import { API_URL } from '../../config';

type Step = 'idle' | 'code' | 'verified';

interface EmailVerificationSectionProps {
  token: string;
  onVerified?: (user: User) => void;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function formatNextChange(nextChangeAt: string | null, daysRemaining: number | null): string {
  if (daysRemaining != null) {
    return `You can change your email again in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
  }
  if (nextChangeAt) {
    try {
      return `You can change your email after ${new Date(nextChangeAt).toLocaleDateString()}`;
    } catch {
      /* fall through */
    }
  }
  return 'You can change your email again later';
}

export function EmailVerificationSection({ token, onVerified }: EmailVerificationSectionProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [email, setEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [canChangeEmail, setCanChangeEmail] = useState(true);
  const [nextChangeAt, setNextChangeAt] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [digits, setDigits] = useState(['', '', '', '']);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const applyStatus = (data: MeEmailStatus) => {
    setCanChangeEmail(data.canChangeEmail);
    setNextChangeAt(data.nextChangeAt);
    setDaysRemaining(data.daysRemaining);
    if (data.email && data.emailVerifiedAt) {
      setVerifiedEmail(data.email);
      setStep('verified');
    } else {
      setEmail(data.email ?? '');
      setVerifiedEmail(null);
      setStep('idle');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/users/me/email`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load email status');
        const data = (await res.json()) as MeEmailStatus;
        if (cancelled) return;
        applyStatus(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load email status');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const sendCode = useCallback(async (targetEmail: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/users/me/email/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const retry = typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 60;
        setCooldown(retry);
        throw new Error(data.error || 'Too many requests');
      }
      if (res.status === 403) {
        if (typeof data.daysRemaining === 'number') setDaysRemaining(data.daysRemaining);
        if (typeof data.nextChangeAt === 'string') setNextChangeAt(data.nextChangeAt);
        setCanChangeEmail(false);
        throw new Error(data.error || 'Email change is locked');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to send code');

      if (data.alreadyVerified) {
        setVerifiedEmail(targetEmail);
        setStep('verified');
        return;
      }

      setPendingEmail(targetEmail);
      setDigits(['', '', '', '']);
      setStep('code');
      setCooldown(typeof data.resendCooldownSeconds === 'number' ? data.resendCooldownSeconds : 60);
      window.setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const verifyCode = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/users/me/email/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Invalid or expired code');

      const user = data.user as User;
      setVerifiedEmail(user.email ?? pendingEmail);
      setCanChangeEmail(false);
      setDaysRemaining(15);
      setStep('verified');
      onVerified?.(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
      setDigits(['', '', '', '']);
      window.setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setBusy(false);
    }
  }, [token, pendingEmail, onVerified]);

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 4).split('');
      const next = ['', '', '', ''];
      chars.forEach((ch, i) => {
        next[i] = ch;
      });
      setDigits(next);
      const focusIdx = Math.min(chars.length, 3);
      inputRefs.current[focusIdx]?.focus();
      if (chars.length === 4) void verifyCode(chars.join(''));
      return;
    }

    const next = [...digits];
    next[index] = cleaned.slice(-1);
    setDigits(next);

    if (cleaned && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d.length === 1)) {
      void verifyCode(next.join(''));
    }
  };

  const handleDigitKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (text.length < 4) return;
    e.preventDefault();
    const next = text.split('');
    setDigits([next[0]!, next[1]!, next[2]!, next[3]!]);
    void verifyCode(text);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading email…
      </div>
    );
  }

  if (step === 'verified' && verifiedEmail) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">Email verified</p>
            <p className="text-xs text-text-muted mt-0.5 truncate">{verifiedEmail}</p>
          </div>
        </div>
        {canChangeEmail ? (
          <button
            type="button"
            onClick={() => {
              setStep('idle');
              setEmail('');
              setPendingEmail('');
              setDigits(['', '', '', '']);
              setError(null);
            }}
            className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
          >
            Change email
          </button>
        ) : (
          <p className="text-xs text-text-muted">
            {formatNextChange(nextChangeAt, daysRemaining)}
          </p>
        )}
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Enter the 4-digit code sent to{' '}
          <span className="text-text-secondary font-medium">{maskEmail(pendingEmail)}</span>
        </p>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2 justify-between sm:justify-start" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={4}
              value={digit}
              disabled={busy}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleDigitKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
              className="w-12 h-14 sm:w-14 text-center text-xl font-semibold tracking-widest rounded-xl border border-border-custom bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 disabled:opacity-50"
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || cooldown > 0}
            onClick={() => void sendCode(pendingEmail)}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:text-text-muted disabled:opacity-60 transition-colors cursor-pointer min-h-[44px]"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep('idle');
              setEmail(pendingEmail);
              setDigits(['', '', '', '']);
              setError(null);
            }}
            className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
          >
            Change email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Add an email address and verify it with a one-time code.
      </p>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <label className="block space-y-1.5">
        <span className="sr-only">Email address</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2.5 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
      </label>
      <button
        type="button"
        disabled={busy || !email.trim()}
        onClick={() => void sendCode(email.trim())}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors cursor-pointer min-h-[44px]"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail className="h-3.5 w-3.5" />
            Send code
          </>
        )}
      </button>
    </div>
  );
}
