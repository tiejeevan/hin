import { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Trash2, Upload } from 'lucide-react';
import type {
  AdminBadge,
  GamificationSettings,
  LevelConfigEntry,
  MetricCatalogResponse,
  PointRule,
} from '@hin/types';
import { API_URL } from '../../config';
import { uploadCompressedImage } from '../../lib/compressImage';
import { AdminUserGamificationView } from './AdminUserGamification';

interface AdminGamificationProps {
  token: string;
}

const OPERATORS = ['>=', '>', '=', '==', '<=', '<'] as const;

export function AdminGamification({ token }: AdminGamificationProps) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<GamificationSettings | null>(null);
  const [badges, setBadges] = useState<AdminBadge[]>([]);
  const [metrics, setMetrics] = useState<MetricCatalogResponse | null>(null);
  const [pointRules, setPointRules] = useState<PointRule[]>([]);
  const [levels, setLevels] = useState<LevelConfigEntry[]>([]);

  const [showCreateBadge, setShowCreateBadge] = useState(false);
  const [badgeForm, setBadgeForm] = useState({
    name: '',
    description: '',
    imageUrl: '' as string | null,
    metricKey: '',
    operator: '>=' as string,
    threshold: '10',
  });
  const [badgeUploading, setBadgeUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, badgesRes, metricsRes, rulesRes, levelsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/gamification/settings`, { headers }),
        fetch(`${API_URL}/api/admin/gamification/badges`, { headers }),
        fetch(`${API_URL}/api/admin/gamification/metrics`, { headers }),
        fetch(`${API_URL}/api/admin/gamification/point-rules`, { headers }),
        fetch(`${API_URL}/api/admin/gamification/levels`, { headers }),
      ]);

      if (!settingsRes.ok || !badgesRes.ok || !metricsRes.ok || !rulesRes.ok || !levelsRes.ok) {
        throw new Error('Failed to load gamification data');
      }

      const [settingsData, badgesData, metricsData, rulesData, levelsData] = await Promise.all([
        settingsRes.json() as Promise<GamificationSettings>,
        badgesRes.json() as Promise<{ badges: AdminBadge[] }>,
        metricsRes.json() as Promise<MetricCatalogResponse>,
        rulesRes.json() as Promise<{ rules: PointRule[] }>,
        levelsRes.json() as Promise<{ levels: LevelConfigEntry[] }>,
      ]);

      setSettings(settingsData);
      setBadges(badgesData.badges);
      setMetrics(metricsData);
      setPointRules(rulesData.rules);
      setLevels(levelsData.levels);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleEnabled = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ gamificationEnabled: !settings.gamificationEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setSettings(data);
      setSuccess(settings.gamificationEnabled ? 'Gamification disabled.' : 'Gamification enabled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleBadgeImage = async (file: File) => {
    setBadgeUploading(true);
    setError(null);
    try {
      const result = await uploadCompressedImage(file, 'badge', token, API_URL);
      setBadgeForm(prev => ({ ...prev, imageUrl: result.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBadgeUploading(false);
    }
  };

  const createBadge = async () => {
    const threshold = parseInt(badgeForm.threshold, 10);
    if (!badgeForm.name.trim() || !badgeForm.metricKey || Number.isNaN(threshold)) {
      setError('Name, metric, and threshold are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/badges`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: badgeForm.name.trim(),
          description: badgeForm.description.trim(),
          imageUrl: badgeForm.imageUrl,
          metricKey: badgeForm.metricKey,
          operator: badgeForm.operator,
          threshold,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create badge');
      setBadges(prev => [...prev, data]);
      setBadgeForm({ name: '', description: '', imageUrl: null, metricKey: '', operator: '>=', threshold: '10' });
      setShowCreateBadge(false);
      setSuccess('Badge created.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create badge');
    } finally {
      setSaving(false);
    }
  };

  const deleteBadge = async (id: number) => {
    if (!confirm('Deactivate this badge? Users who earned it keep it.')) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/badges/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setBadges(prev => prev.filter(b => b.id !== id));
      setSuccess('Badge deactivated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const savePointRules = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/point-rules`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          rules: pointRules.map(r => ({
            actionType: r.actionType,
            points: r.points,
            isActive: r.isActive,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setPointRules(data.rules);
      setSuccess('Point rules saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveLevels = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/levels`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ levels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setLevels(data.levels);
      setSuccess('Level thresholds saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-text-muted p-4">Loading gamification settings…</p>;
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-text-primary">Platform Reviver</h3>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}

      <section className="rounded-xl border border-border-custom bg-bg-tertiary/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-text-primary">Gamification master toggle</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              When off, earning is frozen. Earned badges and points remain visible.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleEnabled()}
            className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] transition-colors cursor-pointer disabled:opacity-50 ${
              settings?.gamificationEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-bg-primary border border-border-custom text-text-secondary hover:text-text-primary'
            }`}
          >
            {settings?.gamificationEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Badges</h4>
          <button
            type="button"
            onClick={() => setShowCreateBadge(prev => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New badge
          </button>
        </div>

        {showCreateBadge && (
          <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4 space-y-3">
            <input
              type="text"
              placeholder="Badge name"
              value={badgeForm.name}
              onChange={e => setBadgeForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm"
            />
            <textarea
              placeholder="Description"
              value={badgeForm.description}
              onChange={e => setBadgeForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm resize-none"
            />
            <div className="flex items-center gap-3">
              {badgeForm.imageUrl ? (
                <img src={badgeForm.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-xl border border-dashed border-border-custom flex items-center justify-center">
                  <Upload className="h-4 w-4 text-text-muted" />
                </div>
              )}
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary">
                  <Upload className="h-3.5 w-3.5" />
                  {badgeUploading ? 'Uploading…' : 'Upload icon'}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={badgeUploading}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleBadgeImage(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <select
              value={badgeForm.metricKey}
              onChange={e => setBadgeForm(prev => ({ ...prev, metricKey: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm"
            >
              <option value="">Select metric…</option>
              {metrics?.metrics.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={badgeForm.operator}
                onChange={e => setBadgeForm(prev => ({ ...prev, operator: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm"
              >
                {OPERATORS.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                placeholder="Threshold"
                value={badgeForm.threshold}
                onChange={e => setBadgeForm(prev => ({ ...prev, threshold: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void createBadge()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
            >
              Create badge
            </button>
          </div>
        )}

        <div className="space-y-2">
          {badges.length === 0 ? (
            <p className="text-xs text-text-muted">No badges configured.</p>
          ) : (
            badges.map(badge => (
              <div
                key={badge.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border-custom bg-bg-tertiary/40"
              >
                {badge.imageUrl ? (
                  <img src={badge.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Award className="h-5 w-5 text-amber-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium text-text-primary truncate">{badge.name}</p>
                  <p className="text-[10px] text-text-muted truncate">
                    {badge.rule
                      ? `${badge.rule.metricKey} ${badge.rule.operator} ${badge.rule.threshold}`
                      : 'No rule'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteBadge(badge.id)}
                  className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
                  aria-label="Deactivate badge"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Point rules</h4>
        <div className="space-y-2">
          {pointRules.map((rule, idx) => (
            <div key={rule.actionType} className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-text-muted w-32 truncate">{rule.actionType}</span>
              <input
                type="number"
                min={0}
                value={rule.points}
                onChange={e => {
                  const points = parseInt(e.target.value, 10);
                  setPointRules(prev => prev.map((r, i) => (
                    i === idx ? { ...r, points: Number.isNaN(points) ? 0 : points } : r
                  )));
                }}
                className="w-20 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-primary text-xs"
              />
              <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.isActive}
                  onChange={e => {
                    setPointRules(prev => prev.map((r, i) => (
                      i === idx ? { ...r, isActive: e.target.checked } : r
                    )));
                  }}
                />
                Active
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void savePointRules()}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
        >
          Save point rules
        </button>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Level thresholds</h4>
        <div className="space-y-2">
          {levels.map((entry, idx) => (
            <div key={entry.level} className="flex items-center gap-2">
              <span className="text-[11px] text-text-muted w-16">Level {entry.level}</span>
              <input
                type="number"
                min={0}
                value={entry.minPoints}
                onChange={e => {
                  const minPoints = parseInt(e.target.value, 10);
                  setLevels(prev => prev.map((l, i) => (
                    i === idx ? { ...l, minPoints: Number.isNaN(minPoints) ? 0 : minPoints } : l
                  )));
                }}
                className="w-28 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-primary text-xs"
              />
              <span className="text-[10px] text-text-muted">min points</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveLevels()}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
        >
          Save levels
        </button>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Metric catalog</h4>
        <p className="text-[10px] text-text-muted">
          Developer-registered metrics available for badge rules. Users never see metric keys.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border-custom">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-bg-primary/30 text-text-muted border-b border-border-custom">
              <tr>
                <th className="p-2">Label</th>
                <th className="p-2">Type</th>
                <th className="p-2">Actions</th>
                <th className="p-2 hidden md:table-cell">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom">
              {(metrics?.metrics ?? []).map(m => (
                <tr key={m.key}>
                  <td className="p-2 font-medium text-text-primary">{m.label}</td>
                  <td className="p-2 text-text-muted">{m.type}</td>
                  <td className="p-2 font-mono text-[10px] text-text-secondary">{m.actions.join(', ')}</td>
                  <td className="p-2 text-text-muted hidden md:table-cell">{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">User support</h4>
        <p className="text-[10px] text-text-muted">
          Inspect counters, badges, and recent ledger. Manual award/revoke for support cases.
        </p>
        <AdminUserGamificationView token={token} badges={badges} />
      </section>
    </div>
  );
}
