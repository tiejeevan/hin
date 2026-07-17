import { useState } from 'react';
import { Bell, Megaphone, Radio, Send, Sparkles } from 'lucide-react';
import { BroadcastDelivery } from '@hin/types';

interface SystemBroadcastProps {
  onBroadcast: (message: string, delivery: BroadcastDelivery) => Promise<{
    success: boolean;
    notificationsCreated?: number;
    error?: string;
  }>;
}

const DELIVERY_OPTIONS: {
  id: BroadcastDelivery;
  label: string;
  description: string;
  icon: typeof Bell;
  accent: string;
}[] = [
  {
    id: 'notification',
    label: 'Notification',
    description: 'Inbox for all users (online and offline). Always audited in the database.',
    icon: Bell,
    accent: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
  },
  {
    id: 'toast',
    label: 'Toast popup',
    description: 'Live popup for online users only. Still saved to the audit log.',
    icon: Sparkles,
    accent: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  },
  {
    id: 'both',
    label: 'Both',
    description: 'Inbox for everyone, toast for online users. Fully audited.',
    icon: Radio,
    accent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
];

export function SystemBroadcast({ onBroadcast }: SystemBroadcastProps) {
  const [message, setMessage] = useState('');
  const [delivery, setDelivery] = useState<BroadcastDelivery>('both');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const remaining = 500 - message.length;
  const canSend = message.trim().length > 0 && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    const label =
      delivery === 'notification' ? 'notifications' : delivery === 'toast' ? 'toast popups' : 'notifications and toasts';

    if (!confirm(`Broadcast this system message as ${label} to all users?`)) return;

    setSending(true);
    setStatus(null);
    try {
      const result = await onBroadcast(message.trim(), delivery);
      if (result.success) {
        const count = result.notificationsCreated ?? 0;
        const parts = ['saved to audit log'];
        if (delivery === 'notification' || delivery === 'both') {
          parts.push(`inbox notification for ${count} user${count === 1 ? '' : 's'}`);
        }
        if (delivery === 'toast' || delivery === 'both') {
          parts.push('toast sent to online users');
        }
        setStatus({ type: 'success', text: `Broadcast sent — ${parts.join(', ')}.` });
        setMessage('');
      } else {
        setStatus({ type: 'error', text: result.error || 'Failed to send broadcast.' });
      }
    } catch {
      setStatus({ type: 'error', text: 'Failed to send broadcast.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      <div>
        <label htmlFor="broadcast-message" className="block text-xs font-semibold text-text-secondary mb-2">
          Message
        </label>
        <textarea
          id="broadcast-message"
          value={message}
          onChange={e => {
            if (e.target.value.length <= 500) setMessage(e.target.value);
            if (status) setStatus(null);
          }}
          rows={4}
          placeholder="Write an announcement, maintenance notice, or news update…"
          className="w-full resize-y min-h-[110px] rounded-xl border border-border-custom bg-bg-primary/40 px-3.5 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40"
        />
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-muted">
          <span>Audited as a system message from the platform</span>
          <span className={remaining < 40 ? 'text-amber-400' : ''}>{remaining} left</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-secondary mb-2">Delivery</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {DELIVERY_OPTIONS.map(option => {
            const Icon = option.icon;
            const selected = delivery === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setDelivery(option.id);
                  if (status) setStatus(null);
                }}
                className={`text-left rounded-xl border p-3 transition-all cursor-pointer min-h-[44px] ${
                  selected
                    ? `${option.accent} shadow-sm ring-1 ring-inset ring-white/5`
                    : 'border-border-custom bg-bg-primary/20 hover:bg-bg-tertiary/40 text-text-secondary'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`h-4 w-4 ${selected ? '' : 'text-text-muted'}`} />
                  <span className={`text-xs font-bold ${selected ? '' : 'text-text-primary'}`}>
                    {option.label}
                  </span>
                </div>
                <p className={`text-[10px] leading-relaxed ${selected ? 'opacity-90' : 'text-text-muted'}`}>
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {message.trim() && (
        <div className="rounded-xl border border-border-custom bg-bg-primary/30 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-2">Preview</p>
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-violet-500/15 flex items-center justify-center">
              <Megaphone className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-text-primary leading-snug whitespace-pre-wrap break-words">
                {message.trim()}
              </p>
              <span className="text-[10px] text-text-muted mt-1 block">System · just now</span>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs ${
            status.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer min-h-[44px]"
        >
          <Send className="h-3.5 w-3.5" />
          {sending ? 'Broadcasting…' : 'Broadcast to all users'}
        </button>
      </div>
    </form>
  );
}
