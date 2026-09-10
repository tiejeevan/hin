import { useState } from 'react';
import { USERNAME_MIN_LENGTH } from '@hin/types';
import { ChevronRight, User } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { API_URL } from '../../config';
import { UsernameField } from './UsernameField';

interface UsernameSetupGateProps {
  token: string;
  onComplete: (data: { token: string; user: UserType }) => void;
}

export function UsernameSetupGate({ token, onComplete }: UsernameSetupGateProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/complete-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not set username');
        return;
      }
      onComplete(data);
    } catch {
      setError('Error connecting to server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-primary p-4">
      <div className="max-w-md w-full bg-bg-secondary border border-border-custom rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-indigo-600/10 text-indigo-400 items-center justify-center mb-3">
            <User className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Choose your username</h2>
          <p className="text-xs text-text-muted mt-2">
            Pick a unique public username before continuing. This cannot be changed later.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs px-3.5 py-2.5 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <UsernameField value={username} onChange={setUsername} disabled={busy} />
          <button
            type="submit"
            disabled={busy || username.trim().length < USERNAME_MIN_LENGTH}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            {busy ? 'Saving…' : 'Continue'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
