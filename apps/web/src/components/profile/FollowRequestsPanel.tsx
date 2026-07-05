import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { FollowRequest } from '@hin/types';
import { UserAvatar } from './UserAvatar';

interface FollowRequestsPanelProps {
  requests: FollowRequest[];
  onApprove: (requesterId: number) => Promise<void>;
  onReject: (requesterId: number) => Promise<void>;
  onViewProfile: (userId: number) => void;
}

export function FollowRequestsPanel({
  requests,
  onApprove,
  onReject,
  onViewProfile,
}: FollowRequestsPanelProps) {
  const [busyId, setBusyId] = useState<number | null>(null);

  if (requests.length === 0) return null;

  const handle = async (id: number, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      if (action === 'approve') await onApprove(id);
      else await onReject(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div id="follow-requests-panel" className="bg-bg-secondary border border-border-custom rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">Follow requests</h3>
      <ul className="space-y-2">
        {requests.map(req => (
          <li
            key={req.requesterId}
            className="flex items-center gap-3 p-2 rounded-xl bg-bg-primary/50 border border-border-custom/60"
          >
            <button
              type="button"
              onClick={() => onViewProfile(req.requesterId)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
            >
              <UserAvatar
                username={req.requesterUsername}
                avatarUrl={req.requesterAvatarUrl}
                size="sm"
              />
              <span className="text-sm font-medium text-text-primary truncate">{req.requesterUsername}</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={busyId === req.requesterId}
                onClick={() => handle(req.requesterId, 'approve')}
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Approve"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={busyId === req.requesterId}
                onClick={() => handle(req.requesterId, 'reject')}
                className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-muted cursor-pointer disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Reject"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
