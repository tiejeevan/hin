import { useState } from 'react';
import { Flag, ExternalLink } from 'lucide-react';
import type { ContentReport, ReviewReportAction } from '@hin/types';

interface ReportsQueueProps {
  reports: ContentReport[];
  loading: boolean;
  onReviewReport: (
    reportId: number,
    action: ReviewReportAction,
    reason?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: number) => void;
  enableModeratorActions?: boolean;
}

function targetLabel(report: ContentReport): string {
  if (report.targetType === 'user') return `@${report.targetUsername ?? report.targetId}`;
  if (report.targetType === 'post') return `Post #${report.targetId}`;
  return `Comment #${report.targetId}`;
}

export function ReportsQueue({
  reports,
  loading,
  onReviewReport,
  onOpenProfile,
  onOpenPost,
  enableModeratorActions = false,
}: ReportsQueueProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolveReasonFor, setResolveReasonFor] = useState<number | null>(null);
  const [resolveReason, setResolveReason] = useState('');

  const handleAction = async (reportId: number, action: ReviewReportAction, reason?: string) => {
    const confirmMsg =
      action === 'dismiss'
        ? 'Dismiss this report?'
        : action === 'resolve'
          ? 'Mark this report resolved?'
          : action === 'escalate'
            ? 'Escalate this report to admins?'
            : action === 'delete_content'
              ? 'Delete the reported content?'
              : 'Delete the reported user account?';
    if (!confirm(confirmMsg)) return;

    setBusyId(reportId);
    setError(null);
    const result = await onReviewReport(reportId, action, reason);
    if (!result.success) setError(result.error || 'Action failed');
    setBusyId(null);
    setResolveReasonFor(null);
    setResolveReason('');
  };

  const submitResolve = async (reportId: number) => {
    const trimmed = resolveReason.trim();
    if (!trimmed) {
      setError('Resolution reason is required');
      return;
    }
    await handleAction(reportId, 'resolve', trimmed);
  };

  if (loading) {
    return <p className="text-xs text-text-muted py-4 text-center">Loading reports...</p>;
  }

  if (reports.length === 0) {
    return <p className="text-xs text-text-muted py-4 text-center">No pending reports.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {reports.map(report => (
        <div
          key={report.id}
          className="rounded-xl border border-border-custom bg-bg-primary/60 p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-text-muted">
                {new Date(report.createdAt).toLocaleString()} · by @{report.reporterUsername}
              </p>
              <p className="text-sm font-medium text-text-primary mt-0.5">
                <Flag className="inline h-3 w-3 text-rose-400 mr-1" />
                {report.reason.replace('_', ' ')} — {targetLabel(report)}
              </p>
              {report.targetPreview && (
                <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                  {report.targetPreview}
                </p>
              )}
              {report.details && (
                <p className="text-xs text-text-muted mt-1 italic">&ldquo;{report.details}&rdquo;</p>
              )}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {report.targetType === 'user' && report.targetUsername && onOpenProfile && (
                <button
                  type="button"
                  onClick={() => onOpenProfile(report.targetUsername!)}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:underline cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                  Profile
                </button>
              )}
              {(report.targetType === 'post' || report.targetType === 'comment') && onOpenPost && report.targetType === 'post' && (
                <button
                  type="button"
                  onClick={() => onOpenPost(report.targetId)}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:underline cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busyId === report.id}
              onClick={() => handleAction(report.id, 'dismiss')}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border-custom text-text-secondary hover:bg-bg-tertiary transition-colors cursor-pointer disabled:opacity-50"
            >
              Dismiss
            </button>
            {report.targetType !== 'user' && (
              <button
                type="button"
                disabled={busyId === report.id}
                onClick={() => handleAction(report.id, 'delete_content')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                Delete content
              </button>
            )}
            {report.targetType === 'user' && (
              <button
                type="button"
                disabled={busyId === report.id}
                onClick={() => handleAction(report.id, 'delete_user')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                Delete user
              </button>
            )}
            {enableModeratorActions && (
              <>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => setResolveReasonFor(report.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Resolve
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => handleAction(report.id, 'escalate')}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Escalate
                </button>
              </>
            )}
          </div>
          {resolveReasonFor === report.id && (
            <div className="pt-2 space-y-2 border-t border-border-custom/60">
              <textarea
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
                rows={2}
                placeholder="Resolution summary…"
                className="w-full rounded-lg border border-border-custom bg-bg-primary/40 px-2 py-1.5 text-xs"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setResolveReasonFor(null); setResolveReason(''); }}
                  className="px-2 py-1 text-[11px] rounded border border-border-custom cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => void submitResolve(report.id)}
                  className="px-2 py-1 text-[11px] rounded bg-emerald-600 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  Confirm resolve
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
