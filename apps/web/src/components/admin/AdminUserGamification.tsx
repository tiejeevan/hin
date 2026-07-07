import { useCallback, useState } from 'react';
import { Award, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { AdminBadge, AdminUserGamification } from '@hin/types';
import { API_URL } from '../../config';

interface AdminUserGamificationViewProps {
  token: string;
  badges: AdminBadge[];
}

export function AdminUserGamificationView({ token, badges }: AdminUserGamificationViewProps) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const [userIdInput, setUserIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminUserGamification | null>(null);
  const [awardBadgeId, setAwardBadgeId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUser = useCallback(async (userId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/users/${userId}`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load user gamification');
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleSearch = () => {
    const id = parseInt(userIdInput, 10);
    if (Number.isNaN(id) || id < 1) {
      setError('Enter a valid user ID');
      return;
    }
    void loadUser(id);
  };

  const awardBadge = async () => {
    if (!data) return;
    const badgeId = parseInt(awardBadgeId, 10);
    if (Number.isNaN(badgeId)) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/users/${data.userId}/badges`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ badgeId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Award failed');
      }
      setData(await res.json());
      setAwardBadgeId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Award failed');
    } finally {
      setSaving(false);
    }
  };

  const revokeBadge = async (badgeId: number) => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/gamification/users/${data.userId}/badges/${badgeId}`,
        { method: 'DELETE', headers },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Revoke failed');
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          placeholder="User ID"
          value={userIdInput}
          onChange={e => setUserIdInput(e.target.value)}
          className="w-32 px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
        >
          <Search className="h-3.5 w-3.5" />
          Lookup
        </button>
        {data && (
          <button
            type="button"
            onClick={() => void loadUser(data.userId)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading && <p className="text-xs text-text-muted">Loading…</p>}

      {data && !loading && (
        <div className="space-y-4 rounded-xl border border-border-custom p-4">
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">
              @{data.username}
              <span className="text-text-muted font-normal ml-2">#{data.userId}</span>
            </p>
            <p className="text-xs text-text-muted mt-1">
              Level {data.level} · {data.totalPoints} points
            </p>
          </div>

          <section className="text-left space-y-2">
            <h5 className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Counters</h5>
            {data.counters.length === 0 ? (
              <p className="text-xs text-text-muted">No counters yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {data.counters.map(c => (
                  <div key={c.label} className="rounded-lg border border-border-custom px-3 py-2 bg-bg-primary/30">
                    <p className="text-[10px] text-text-muted truncate">{c.label}</p>
                    <p className="text-sm font-semibold text-text-primary">{c.value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="text-left space-y-2">
            <h5 className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Badges</h5>
            {data.badges.length === 0 ? (
              <p className="text-xs text-text-muted">No badges earned.</p>
            ) : (
              <ul className="space-y-2">
                {data.badges.map(b => (
                  <li key={b.id} className="flex items-center gap-2 rounded-lg border border-border-custom px-3 py-2">
                    {b.imageUrl ? (
                      <img src={b.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                        <Award className="h-4 w-4 text-amber-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{b.name}</p>
                      <p className="text-[10px] text-text-muted">{b.earnedAt}</p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void revokeBadge(b.id)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
                      aria-label={`Revoke ${b.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <select
                value={awardBadgeId}
                onChange={e => setAwardBadgeId(e.target.value)}
                className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-xs"
              >
                <option value="">Award badge…</option>
                {badges.filter(b => b.isActive).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving || !awardBadgeId}
                onClick={() => void awardBadge()}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
              >
                Award
              </button>
            </div>
          </section>

          <section className="text-left space-y-2">
            <h5 className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Recent ledger</h5>
            {data.recentLedger.length === 0 ? (
              <p className="text-xs text-text-muted">No ledger entries.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border-custom">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-bg-primary/30 text-text-muted border-b border-border-custom">
                    <tr>
                      <th className="p-2">Action</th>
                      <th className="p-2">Delta</th>
                      <th className="p-2">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-custom">
                    {data.recentLedger.map((row, i) => (
                      <tr key={`${row.createdAt}-${i}`}>
                        <td className="p-2 font-mono text-text-secondary">{row.actionType}</td>
                        <td className={`p-2 font-semibold ${row.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {row.delta >= 0 ? '+' : ''}{row.delta}
                        </td>
                        <td className="p-2 text-text-muted">{row.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
