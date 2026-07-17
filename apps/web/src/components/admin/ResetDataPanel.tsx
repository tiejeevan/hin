import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ResetPlatformDataResult } from '@hin/types';
import { API_URL } from '../../config';

interface ResetDataPanelProps {
  token: string;
  onResetComplete: () => Promise<void> | void;
}

export function ResetDataPanel({ token, onResetComplete }: ResetDataPanelProps) {
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetPlatformDataResult | null>(null);

  const canReset = confirmText === 'RESET DATA' && !resetting;

  const handleReset = async () => {
    if (!canReset) return;
    setResetting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/admin/reset-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset data');

      setResult(data as ResetPlatformDataResult);
      setConfirmText('');
      await onResetComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset data');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-text-primary">Reset data for a fresh start</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              This permanently wipes customer accounts and all platform activity: posts, comments, DMs,
              notifications, reports, follows, blocks, media records, Olabid discussion, broadcasts,
              audit history, and user gamification progress. Admin accounts remain.
            </p>
          </div>
        </div>

        <label className="block space-y-2 max-w-sm">
          <span className="text-xs font-semibold text-text-secondary">
            Type <span className="font-mono text-rose-300">RESET DATA</span> to confirm
          </span>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-rose-500/30 bg-bg-primary text-sm text-text-primary"
            placeholder="RESET DATA"
            autoComplete="off"
          />
        </label>

        {error && <p className="text-xs text-rose-300">{error}</p>}
        {result && (
          <p className="text-xs text-emerald-400">
            Reset complete. Removed {result.customersDeleted} customer account{result.customersDeleted === 1 ? '' : 's'}.
            {' '}Admin accounts remaining: {result.adminsRemaining}.
          </p>
        )}

        <button
          type="button"
          disabled={!canReset}
          onClick={() => void handleReset()}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:hover:bg-rose-600 text-white transition-colors cursor-pointer min-h-[44px]"
        >
          {resetting ? 'Resetting…' : 'Reset Data'}
        </button>
      </div>
    </div>
  );
}
