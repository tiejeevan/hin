import { useState } from 'react';
import { Flag, ExternalLink } from 'lucide-react';
import type { ContentReport, ReviewReportAction } from '@hin/types';

interface ReportsQueueProps {
  reports: ContentReport[];
  loading: boolean;
  onReviewReport: (reportId: number, action: ReviewReportAction) => Promise<{ success: boolean; error?: string }>;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: number) => void;
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
}: ReportsQueueProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (reportId: number, action: ReviewReportAction) => {
    const confirmMsg =
      action === 'dismiss'
        ? 'Dismiss this report?'
        : action === 'delete_content'
          ? 'Delete the reported content?'
          : 'Delete the reported user account?';
    if (!confirm(confirmMsg)) return;

    setBusyId(reportId);
    setError(null);
    const result = await onReviewReport(reportId, action);
    if (!result.success) setError(result.error || 'Action failed');
    setBusyId(null);
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
          </div>
        </div>
      ))}
    </div>
  );
}
