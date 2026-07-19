import { useState } from 'react';
import { API_URL } from '../../config';

interface ChangePasswordSectionProps {
  token: string;
  /** False for Google-only accounts with no password hash. */
  hasPassword: boolean;
}

export function ChangePasswordSection({ token, hasPassword }: ChangePasswordSectionProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!hasPassword) {
    return (
      <p className="text-xs text-text-muted">
        This account uses Google sign-in and does not have a password to change.
      </p>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/users/me/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Change password
        </h4>
        <p className="text-xs text-text-muted mt-1">
          Update your password while signed in.
        </p>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">Password updated.</p>}
      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Current password</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-text-muted">New password</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Confirm new password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
          required
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors cursor-pointer min-h-[44px]"
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
