import { Settings } from 'lucide-react';
import { FollowRequest } from '@hin/types';
import { FollowRequestsPanel } from './FollowRequestsPanel';

interface ProfileSettingsPanelProps {
  requests: FollowRequest[];
  highlighted?: boolean;
  onApprove: (requesterId: number) => Promise<void>;
  onReject: (requesterId: number) => Promise<void>;
  onViewProfile: (userId: number) => void;
  onClose: () => void;
}

export function ProfileSettingsPanel({
  requests,
  highlighted = false,
  onApprove,
  onReject,
  onViewProfile,
  onClose,
}: ProfileSettingsPanelProps) {
  return (
    <div
      className={`bg-bg-secondary border rounded-2xl p-4 space-y-4 transition-colors ${
        highlighted ? 'border-indigo-500/50 animate-blink-border' : 'border-border-custom'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Profile settings</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px] px-2"
        >
          Close
        </button>
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Follow requests</h3>
          <p className="text-xs text-text-muted mt-1">Approve or decline users who want to follow you.</p>
        </div>
        {requests.length > 0 ? (
          <FollowRequestsPanel
            requests={requests}
            onApprove={onApprove}
            onReject={onReject}
            onViewProfile={onViewProfile}
          />
        ) : (
          <p className="text-sm text-text-muted py-6 text-center border border-dashed border-border-custom rounded-xl">
            No pending follow requests.
          </p>
        )}
      </section>
    </div>
  );
}
