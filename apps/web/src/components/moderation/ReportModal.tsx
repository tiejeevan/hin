import { useState } from 'react';
import { X, Flag } from 'lucide-react';
import type { ReportReason } from '@hin/types';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'other', label: 'Other' },
];

interface ReportModalProps {
  onClose: () => void;
  onSubmit: (reason: ReportReason, details?: string) => Promise<{ success: boolean; error?: string }>;
}

export function ReportModal({ onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(reason, details.trim() || undefined);
      if (!result.success) {
        setError(result.error || 'Failed to submit report');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div
        role="dialog"
        aria-labelledby="report-modal-title"
        className="w-full max-w-md rounded-2xl border border-border-custom bg-bg-secondary shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-custom">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-rose-400" />
            <h2 id="report-modal-title" className="text-sm font-semibold text-text-primary">
              Report content
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-text-secondary mb-2">Reason</legend>
            {REASONS.map(r => (
              <label
                key={r.value}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border-custom cursor-pointer hover:bg-bg-tertiary transition-colors has-[:checked]:border-indigo-500/50 has-[:checked]:bg-indigo-500/5"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-indigo-500"
                />
                <span className="text-xs text-text-primary">{r.label}</span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="report-details" className="block text-xs font-medium text-text-secondary mb-1.5">
              Additional details (optional)
            </label>
            <textarea
              id="report-details"
              value={details}
              onChange={e => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Tell us more about the issue..."
              className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
