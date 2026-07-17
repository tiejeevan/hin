import { BroadcastDelivery, SystemBroadcast as SystemBroadcastRecord } from '@hin/types';

interface BroadcastAuditLogProps {
  history: SystemBroadcastRecord[];
}

function deliveryLabel(delivery: BroadcastDelivery): string {
  if (delivery === 'notification') return 'Notification';
  if (delivery === 'toast') return 'Toast';
  return 'Both';
}

function deliveryBadgeClass(delivery: BroadcastDelivery): string {
  if (delivery === 'notification') return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25';
  if (delivery === 'toast') return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
}

export function BroadcastAuditLog({ history }: BroadcastAuditLogProps) {
  if (history.length === 0) {
    return <div className="p-3 text-center text-xs text-text-muted">No broadcasts sent yet.</div>;
  }

  return (
    <ul className="divide-y divide-border-custom max-h-80 overflow-y-auto">
      {history.map(item => (
        <li key={item.id} className="p-3.5 text-left hover:bg-bg-tertiary/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-words">
                {item.content}
              </p>
              <p className="text-[10px] text-text-muted mt-1.5">
                #{item.id} · @{item.senderUsername} · {new Date(item.createdAt).toLocaleString()}
                {(item.delivery === 'notification' || item.delivery === 'both') && (
                  <>
                    {' '}
                    · {item.notificationsCreated} inbox row
                    {item.notificationsCreated === 1 ? '' : 's'}
                  </>
                )}
              </p>
            </div>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border ${deliveryBadgeClass(item.delivery)}`}
            >
              {deliveryLabel(item.delivery)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
