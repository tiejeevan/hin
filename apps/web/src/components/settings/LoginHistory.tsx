import { useState, useEffect } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { AuditLogPartial, AuditEventType, AuditLogPartialPage } from '@hin/types';
import { API_URL } from '../../config';

interface LoginHistoryProps {
  token: string;
}

const EVENT_LABELS: Partial<Record<AuditEventType, string>> = {
  login: 'Signed in',
  register: 'Account created',
  logout: 'Signed out',
  failed_login: 'Failed sign-in attempt',
  password_change: 'Password changed',
  account_delete: 'Account deleted',
};

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatClientTs(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function deviceEmoji(deviceType: string | null): string {
  if (deviceType === 'mobile') return '📱';
  if (deviceType === 'tablet') return '📟';
  if (deviceType === 'bot') return '🤖';
  return '🖥️';
}

function LogEntry({ log }: { log: AuditLogPartial }) {
  const isFail = !log.success;
  const geo = [log.city, log.region, log.country].filter(Boolean).join(', ') || 'Unknown location';
  const device = [log.os, log.browser].filter(Boolean).join(' · ') || 'Unknown device';
  const label = EVENT_LABELS[log.eventType] ?? log.eventType;
  const localTs = formatClientTs(log.clientLocalTime);

  return (
    <li className={`flex items-start gap-3 py-3.5 px-4 rounded-xl border ${isFail
      ? 'bg-rose-500/5 border-rose-500/20'
      : 'bg-bg-secondary border-border-custom'
    }`}>
      <div className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-sm ${isFail
        ? 'bg-rose-500/15 border border-rose-500/25'
        : 'bg-emerald-500/15 border border-emerald-500/25'
      }`}>
        {isFail ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${isFail ? 'text-rose-400' : 'text-text-primary'}`}>
            {label}
          </p>
          <span className="text-[10px] text-text-muted">{formatTs(log.createdAt)}</span>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">
          {deviceEmoji(log.deviceType)} {device}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          📍 {geo}
        </p>
        {localTs && (
          <p className="text-[10px] text-text-muted mt-0.5">
            Your local time: {localTs}
          </p>
        )}
      </div>
    </li>
  );
}

export function LoginHistory({ token }: LoginHistoryProps) {
  const [logs, setLogs] = useState<AuditLogPartial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const fetchLogs = async (cursor?: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = cursor ? `?cursor=${cursor}` : '';
      const res = await fetch(`${API_URL}/api/me/audit-logs${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditLogPartialPage = await res.json();
      if (cursor) {
        setLogs(prev => [...prev, ...data.logs]);
      } else {
        setLogs(data.logs);
      }
      setNextCursor(data.nextCursor);
    } catch (e: any) {
      setError(e.message || 'Failed to load login history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
        {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <p className="text-xs text-text-muted text-center py-6">No login history yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Showing your recent account activity. Only you can see this.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {logs.map(log => <LogEntry key={log.id} log={log} />)}
      </ul>

      {nextCursor && (
        <button
          id="login-history-load-more"
          type="button"
          onClick={() => fetchLogs(nextCursor)}
          disabled={loading}
          className="w-full py-2 rounded-xl border border-border-custom text-xs text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/30 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Loading…' : 'Load older activity'}
        </button>
      )}
    </div>
  );
}
