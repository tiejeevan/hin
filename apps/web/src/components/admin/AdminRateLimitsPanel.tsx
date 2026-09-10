import { useEffect, useState } from 'react';
import { Gauge, Shield } from 'lucide-react';
import type { RateLimitCatalogResponse } from '@hin/types';
import { API_URL } from '../../config';

interface AdminRateLimitsPanelProps {
  token: string;
}

function storageLabel(storage: RateLimitCatalogResponse['entries'][number]['storage']): string {
  switch (storage) {
    case 'd1':
      return 'D1 buckets';
    case 'memory':
      return 'WebSocket DO';
    case 'counter':
      return 'Gamification counters';
    default:
      return storage;
  }
}

export function AdminRateLimitsPanel({ token }: AdminRateLimitsPanelProps) {
  const [catalog, setCatalog] = useState<RateLimitCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/rate-limits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load rate limits');
        const data = await res.json() as RateLimitCatalogResponse;
        if (!cancelled) setCatalog(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load rate limits');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <p className="text-xs text-text-muted p-2">Loading rate limit reference…</p>;
  }

  if (error || !catalog) {
    return <p className="text-xs text-rose-400 p-2">{error ?? 'Unable to load rate limits.'}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Gauge className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs text-text-secondary">
            Active application-layer limits enforced by the API and chat WebSocket.
            Values are read-only; change budgets in server code.
          </p>
          <p className="text-[10px] text-text-muted flex items-start gap-1.5">
            <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
            {catalog.adminBypass}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-custom">
        <table className="w-full text-[11px] text-left">
          <thead className="bg-bg-primary/30 text-text-muted border-b border-border-custom">
            <tr>
              <th className="p-2 font-semibold">Tier</th>
              <th className="p-2 font-semibold">Scope</th>
              <th className="p-2 font-semibold">Limit</th>
              <th className="p-2 font-semibold">Window</th>
              <th className="p-2 font-semibold hidden lg:table-cell">Applies to</th>
              <th className="p-2 font-semibold">Storage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom">
            {catalog.entries.map((entry, index) => (
              <tr key={`${entry.tier}-${entry.scope}-${entry.appliesTo}-${index}`}>
                <td className="p-2 font-medium text-text-primary whitespace-nowrap">{entry.tier}</td>
                <td className="p-2 text-text-secondary whitespace-nowrap">{entry.scope}</td>
                <td className="p-2 text-text-primary whitespace-nowrap">{entry.limitLabel}</td>
                <td className="p-2 text-text-muted whitespace-nowrap">{entry.windowLabel}</td>
                <td className="p-2 text-text-muted hidden lg:table-cell">{entry.appliesTo}</td>
                <td className="p-2 text-text-muted whitespace-nowrap">{storageLabel(entry.storage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {catalog.exemptions.length > 0 && (
        <div className="text-[10px] text-text-muted space-y-1">
          <p className="font-semibold uppercase tracking-wide text-text-secondary">Exemptions</p>
          <ul className="list-disc list-inside space-y-0.5">
            {catalog.exemptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-text-muted leading-relaxed border-t border-border-custom pt-3">
        {catalog.edgeNote}
      </p>
    </div>
  );
}
