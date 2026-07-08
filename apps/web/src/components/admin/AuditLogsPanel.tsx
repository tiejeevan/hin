import { useState, useCallback } from 'react';
import { Search, XCircle, RefreshCw, ChevronDown } from 'lucide-react';
import type { AuditLog, AuditEventType, AuditLogPage } from '@hin/types';
import { API_URL } from '../../config';

interface AuditLogsPanelProps {
  token: string;
}

const EVENT_LABELS: Record<AuditEventType, string> = {
  login: 'Login',
  register: 'Register',
  logout: 'Logout',
  failed_login: 'Failed Login',
  password_change: 'Password Change',
  account_delete: 'Account Delete',
  admin_impersonate: 'Admin Impersonate',
  role_change: 'Role Change',
};

const EVENT_COLORS: Record<AuditEventType, string> = {
  login: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  register: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  logout: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  failed_login: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  password_change: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  account_delete: 'bg-rose-600/15 text-rose-300 border-rose-600/25',
  admin_impersonate: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  role_change: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
};

function EventBadge({ type }: { type: AuditEventType }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${EVENT_COLORS[type]}`}>
      {EVENT_LABELS[type]}
    </span>
  );
}

function SuccessDot({ success }: { success: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${success ? 'bg-emerald-400' : 'bg-rose-400'}`} title={success ? 'Success' : 'Failure'} />
  );
}

function DeviceIcon({ deviceType }: { deviceType: string | null }) {
  if (deviceType === 'mobile') return <span title="Mobile">📱</span>;
  if (deviceType === 'tablet') return <span title="Tablet">📟</span>;
  if (deviceType === 'bot') return <span title="Bot">🤖</span>;
  return <span title="Desktop">🖥️</span>;
}

function formatGeo(log: AuditLog): string {
  const parts = [log.country, log.region, log.city].filter(Boolean);
  return parts.length ? parts.join(' › ') : '—';
}

function formatDevice(log: AuditLog): string {
  const parts = [log.os, log.browser].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Expand-on-click row for extra details
function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="hover:bg-bg-tertiary/40 cursor-pointer transition-colors"
        onClick={() => setExpanded(prev => !prev)}
      >
        <td className="px-3 py-2.5 text-[11px] text-text-muted whitespace-nowrap font-mono">
          #{log.id}
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-secondary whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <SuccessDot success={log.success} />
            <EventBadge type={log.eventType} />
          </div>
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-primary font-medium whitespace-nowrap">
          {log.username ? `@${log.username}` : <span className="text-text-muted italic">anon</span>}
          {log.targetUsername && (
            <span className="text-text-muted"> → @{log.targetUsername}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-muted whitespace-nowrap font-mono">
          {log.ipAddress ?? '—'}
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-muted whitespace-nowrap">
          {formatGeo(log)}
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-muted whitespace-nowrap">
          <div className="flex items-center gap-1">
            <DeviceIcon deviceType={log.deviceType} />
            {formatDevice(log)}
          </div>
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-muted whitespace-nowrap">
          {formatTs(log.createdAt)}
        </td>
        <td className="px-3 py-2.5 text-[11px] text-text-muted">
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-bg-tertiary/20 border-b border-border-custom">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
              {log.failureReason && (
                <div>
                  <span className="text-text-muted">Failure reason: </span>
                  <span className="text-rose-400 font-mono">{log.failureReason}</span>
                </div>
              )}
              {log.clientLocalTime && (
                <div>
                  <span className="text-text-muted">Client local time: </span>
                  <span className="text-text-secondary">{formatTs(log.clientLocalTime)}</span>
                </div>
              )}
              {log.timezone && (
                <div>
                  <span className="text-text-muted">Timezone: </span>
                  <span className="text-text-secondary">{log.timezone}</span>
                </div>
              )}
              {(log.postalCode || log.latitude) && (
                <div>
                  <span className="text-text-muted">ZIP / Coords: </span>
                  <span className="text-text-secondary">
                    {log.postalCode ?? '—'}
                    {log.latitude && ` (${log.latitude}, ${log.longitude})`}
                  </span>
                </div>
              )}
              {log.sessionId && (
                <div className="col-span-2">
                  <span className="text-text-muted">Session ID: </span>
                  <span className="text-text-secondary font-mono text-[10px]">{log.sessionId}</span>
                </div>
              )}
              {log.userAgent && (
                <div className="col-span-3">
                  <span className="text-text-muted">User-Agent: </span>
                  <span className="text-text-secondary font-mono text-[10px] break-all">{log.userAgent}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AuditLogsPanel({ token }: AuditLogsPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const [showLogs, setShowLogs] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Record<number, number | null>>({ 1: null });

  // Filters
  const [filterUsername, setFilterUsername] = useState('');
  const [filterEventType, setFilterEventType] = useState<AuditEventType | ''>('');
  const [filterIp, setFilterIp] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterSuccess, setFilterSuccess] = useState<'' | '1' | '0'>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const buildQs = useCallback((cursor?: number) => {
    const p = new URLSearchParams();
    if (filterUsername.trim()) p.set('username', filterUsername.trim());
    if (filterEventType) p.set('eventType', filterEventType);
    if (filterIp.trim()) p.set('ip', filterIp.trim());
    if (filterCountry.trim()) p.set('country', filterCountry.trim().toUpperCase());
    if (filterSuccess) p.set('success', filterSuccess);
    if (filterFrom) p.set('from', filterFrom);
    if (filterTo) p.set('to', filterTo);
    if (cursor) p.set('cursor', String(cursor));
    p.set('limit', '10');
    return p.toString();
  }, [filterUsername, filterEventType, filterIp, filterCountry, filterSuccess, filterFrom, filterTo]);

  const fetchLogs = useCallback(async (pageToFetch: number, cursorOverride?: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const cursor = cursorOverride !== undefined ? cursorOverride : (pageCursors[pageToFetch] ?? null);
      const qs = buildQs(cursor ?? undefined);
      const res = await fetch(`${API_URL}/api/admin/audit-logs${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditLogPage = await res.json();
      
      setLogs(data.logs);
      setNextCursor(data.nextCursor);
      setPageCursors(prev => ({
        ...(cursorOverride !== undefined ? { 1: null } : prev),
        [pageToFetch + 1]: data.nextCursor
      }));
      setCurrentPage(pageToFetch);
    } catch (e: any) {
      setError(e.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [token, buildQs, pageCursors]);

  const handleToggleShowLogs = () => {
    if (showLogs) {
      setShowLogs(false);
      setLogs([]);
      setNextCursor(null);
      setCurrentPage(1);
      setPageCursors({ 1: null });
    } else {
      setShowLogs(true);
      fetchLogs(1, null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowLogs(true);
    fetchLogs(1, null);
  };

  const clearFilters = () => {
    setFilterUsername('');
    setFilterEventType('');
    setFilterIp('');
    setFilterCountry('');
    setFilterSuccess('');
    setFilterFrom('');
    setFilterTo('');
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Filter bar */}
      <form onSubmit={handleSearch} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
            <input
              id="audit-filter-username"
              type="text"
              placeholder="Username"
              value={filterUsername}
              onChange={e => setFilterUsername(e.target.value)}
              className="w-full bg-bg-primary border border-border-custom rounded-lg pl-8 pr-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <select
            id="audit-filter-event"
            value={filterEventType}
            onChange={e => setFilterEventType(e.target.value as AuditEventType | '')}
            className="bg-bg-primary border border-border-custom rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="">All events</option>
            {(Object.keys(EVENT_LABELS) as AuditEventType[]).map(k => (
              <option key={k} value={k}>{EVENT_LABELS[k]}</option>
            ))}
          </select>

          <input
            id="audit-filter-ip"
            type="text"
            placeholder="IP address"
            value={filterIp}
            onChange={e => setFilterIp(e.target.value)}
            className="bg-bg-primary border border-border-custom rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors font-mono"
          />

          <input
            id="audit-filter-country"
            type="text"
            placeholder="Country (e.g. US)"
            maxLength={2}
            value={filterCountry}
            onChange={e => setFilterCountry(e.target.value)}
            className="bg-bg-primary border border-border-custom rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
          <select
            id="audit-filter-success"
            value={filterSuccess}
            onChange={e => setFilterSuccess(e.target.value as '' | '1' | '0')}
            className="bg-bg-primary border border-border-custom rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="">All outcomes</option>
            <option value="1">✅ Success only</option>
            <option value="0">❌ Failures only</option>
          </select>

          <input
            id="audit-filter-from"
            type="datetime-local"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="bg-bg-primary border border-border-custom rounded-lg px-3 py-2 text-xs text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <input
            id="audit-filter-to"
            type="datetime-local"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="bg-bg-primary border border-border-custom rounded-lg px-3 py-2 text-xs text-text-muted focus:outline-none focus:border-indigo-500 transition-colors"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              id="audit-search-btn"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              Search
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-lg border border-border-custom text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
              title="Clear filters"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (showLogs) {
                  fetchLogs(currentPage);
                } else {
                  setShowLogs(true);
                  fetchLogs(1, null);
                }
              }}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-border-custom text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </form>

      {/* Legend / summary */}
      <div className="flex items-center gap-3 text-[10px] text-text-muted flex-wrap">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Success</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400 inline-block" /> Failure</span>
        <span>· Click any row to expand details</span>
        <span>
          ·{' '}
          <button
            type="button"
            onClick={handleToggleShowLogs}
            className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer hover:underline"
          >
            {showLogs ? 'Hide recent events' : 'Show recent events'}
          </button>
        </span>
      </div>

      {/* Table & pagination */}
      {showLogs && (
        <>
          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!error && logs.length === 0 && !loading && (
            <div className="py-8 text-center text-xs text-text-muted">
              No audit log entries found.
            </div>
          )}

          {!error && logs.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border-custom">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="bg-bg-tertiary/50 border-b border-border-custom">
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">#</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Event</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">User</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">IP Address</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Location</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Device</th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Time (UTC)</th>
                    <th className="px-3 py-2 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom">
                  {logs.map(log => <LogRow key={log.id} log={log} />)}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!error && logs.length > 0 && (
            <div className="flex items-center justify-between border-t border-border-custom pt-4 mt-2">
              <button
                type="button"
                onClick={() => fetchLogs(currentPage - 1)}
                disabled={loading || currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-border-custom text-xs text-text-secondary hover:bg-bg-tertiary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs text-text-muted font-medium">
                Page {currentPage}
              </span>
              <button
                type="button"
                onClick={() => fetchLogs(currentPage + 1)}
                disabled={loading || !nextCursor}
                className="px-3 py-1.5 rounded-lg border border-border-custom text-xs text-text-secondary hover:bg-bg-tertiary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          )}

          {loading && logs.length === 0 && (
            <div className="py-8 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-text-muted mx-auto" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
