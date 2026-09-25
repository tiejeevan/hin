import { useState } from 'react';

interface ReasonPromptModalProps {
  title: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  busy?: boolean;
}

export function ReasonPromptModal({
  title,
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
  busy = false,
}: ReasonPromptModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Reason is required');
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border-custom bg-bg-secondary p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-2">{title}</h3>
        <label className="block text-[11px] text-text-muted mb-1">Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border-custom bg-bg-primary/40 px-3 py-2 text-sm text-text-primary"
          placeholder="Explain this moderation action…"
        />
        {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg border border-border-custom text-text-secondary cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="px-3 py-1.5 text-xs rounded-lg bg-rose-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
