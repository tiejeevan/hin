interface AccountModerationBlockModalProps {
  code: 'account_suspended' | 'account_banned';
  error: string;
  reason: string | null;
  until: string | null;
  onLogout: () => void;
}

export function AccountModerationBlockModal({
  code,
  error,
  reason,
  until,
  onLogout,
}: AccountModerationBlockModalProps) {
  const untilLabel = until ? new Date(until).toLocaleString() : null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-bg-secondary p-5 shadow-xl">
        <h2 className="text-lg font-bold text-text-primary">
          {code === 'account_banned' ? 'Account banned' : 'Account suspended'}
        </h2>
        <p className="text-sm text-text-secondary mt-2">{error}</p>
        {reason && (
          <p className="text-sm text-text-muted mt-3">
            <span className="font-semibold text-text-secondary">Reason:</span> {reason}
          </p>
        )}
        {untilLabel && code === 'account_suspended' && (
          <p className="text-sm text-text-muted mt-2">
            <span className="font-semibold text-text-secondary">Until:</span> {untilLabel}
          </p>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
