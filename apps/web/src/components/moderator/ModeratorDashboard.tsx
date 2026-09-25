import { useCallback, useState } from 'react';
import { Flag, RefreshCw } from 'lucide-react';
import type { ContentReport, ReviewReportAction } from '@hin/types';
import { API_URL } from '../../config';
import { usePermissions } from '../../lib/permissions';
import { ReportsQueue } from '../admin/ReportsQueue';
import { AdminCollapsibleSection } from '../admin/AdminCollapsibleSection';

interface ModeratorDashboardProps {
  token: string;
  reports: ContentReport[] | null;
  onLoadReports: () => Promise<void>;
  onReviewReport: (reportId: number, action: ReviewReportAction) => Promise<{ success: boolean; error?: string }>;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: number) => void;
}

export function ModeratorDashboard({
  token,
  reports,
  onLoadReports,
  onReviewReport,
  onOpenProfile,
  onOpenPost,
}: ModeratorDashboardProps) {
  const { can, permissions, role } = usePermissions();
  const canViewReports =
    role === 'admin' ||
    permissions === 'all' ||
    (Array.isArray(permissions) && permissions.includes('report.view'));

  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);

  const loadDashboardCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/moderation/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts ?? {});
      }
    } finally {
      setCountsLoading(false);
    }
  }, [token]);

  const loadReportsData = useCallback(
    async (force: boolean) => {
      if (!canViewReports) return;
      setReportsLoading(true);
      try {
        if (force || reports === null) {
          await onLoadReports();
        }
        await loadDashboardCounts();
      } finally {
        setReportsLoading(false);
      }
    },
    [canViewReports, loadDashboardCounts, onLoadReports, reports],
  );

  const toggleReports = async () => {
    if (reportsOpen) {
      setReportsOpen(false);
      return;
    }
    setReportsOpen(true);
    if (reports !== null && counts !== null) return;
    await loadReportsData(false);
  };

  const refreshReports = async () => {
    if (!canViewReports) return;
    setReportsOpen(true);
    await loadReportsData(true);
  };

  return (
    <div className="flex-grow overflow-y-auto p-2 md:p-3 space-y-3">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Moderator Dashboard</h2>
        <p className="text-xs text-text-muted">
          Nothing loads until you open a section — same as the admin dashboard.
        </p>
      </div>

      {counts !== null && !countsLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {can('report.view') && (
            <div className="rounded-xl border border-border-custom p-3">
              <p className="text-[10px] uppercase text-text-muted">Reports pending</p>
              <p className="text-xl font-bold text-rose-400">{counts.reportsPending ?? 0}</p>
            </div>
          )}
          {can('post.view') && (
            <div className="rounded-xl border border-border-custom p-3">
              <p className="text-[10px] uppercase text-text-muted">Post reports</p>
              <p className="text-xl font-bold">{counts.postsAwaitingReview ?? 0}</p>
            </div>
          )}
          {can('comment.view') && (
            <div className="rounded-xl border border-border-custom p-3">
              <p className="text-[10px] uppercase text-text-muted">Comment reports</p>
              <p className="text-xl font-bold">{counts.commentsAwaitingReview ?? 0}</p>
            </div>
          )}
        </div>
      )}

      {canViewReports && (
        <AdminCollapsibleSection
          title="Reports queue"
          description="Load pending user-submitted reports when you are ready to review."
          icon={<Flag className="h-5 w-5" />}
          iconClassName="bg-rose-600/15 border-rose-500/25 text-rose-400"
          open={reportsOpen}
          loading={reportsLoading}
          onToggle={() => void toggleReports()}
        >
          <div className="flex justify-end mb-2">
            <button
              type="button"
              disabled={reportsLoading}
              onClick={() => void refreshReports()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-custom px-2.5 py-1.5 text-xs font-medium text-text-secondary cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reportsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <ReportsQueue
            reports={reports ?? []}
            loading={reportsLoading && reports === null}
            onReviewReport={onReviewReport}
            onOpenProfile={onOpenProfile}
            onOpenPost={onOpenPost}
            enableModeratorActions
          />
        </AdminCollapsibleSection>
      )}
    </div>
  );
}
