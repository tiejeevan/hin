import { useState } from 'react';
import { Mail, ChevronRight, ChevronLeft } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { API_URL } from '../../config';

interface EmailVerificationGateProps {
  token: string;
  user: UserType;
  onComplete: (user: UserType) => void;
  onBack: () => void;
}

export function EmailVerificationGate({ token, user, onComplete, onBack }: EmailVerificationGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const maskedEmail = user.email
    ? user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
    : 'your email';

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        return;
      }
      onComplete(data.user);
    } catch {
      setError('Error connecting to server');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!user.email) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/users/me/email/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not resend code');
        return;
      }
      setResent(true);
    } catch {
      setError('Error connecting to server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-primary p-4">
      <div className="max-w-md w-full bg-bg-secondary border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="absolute top-4 left-4 flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px] px-2"
          aria-label="Back to sign in"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="text-center mb-6 pt-6">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-indigo-600/10 text-indigo-400 items-center justify-center mb-3">
            <Mail className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Verify your email</h2>
          <p className="text-xs text-text-muted mt-2">
            We sent a 4-digit code to {maskedEmail}. Enter it below to activate your account.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-3.5 py-2.5 rounded-xl">
            {error}
          </div>
        )}
        {resent && !error && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3.5 py-2.5 rounded-xl">
            New code sent.
          </div>
        )}

        <form onSubmit={(e) => void handleVerify(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              placeholder="0000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={busy}
              className="w-full bg-bg-primary border border-border-custom rounded-xl px-4 py-3 text-sm text-text-primary tracking-[0.5em] text-center font-mono placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 4}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            {busy ? 'Verifying…' : 'Verify email'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={busy}
          className="mt-4 w-full text-xs text-indigo-400 hover:underline cursor-pointer min-h-[44px]"
        >
          Resend code
        </button>
      </div>
    </div>
  );
}
