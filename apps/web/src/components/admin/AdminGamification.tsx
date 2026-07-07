import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Award, ChevronDown, Grid, MoreVertical, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
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

const INFLUENCE_ICONS = [
  { name: 'Trendsetter', filename: 'trendsetter.svg' },
  { name: 'Hype Engine', filename: 'hype-engine.svg' },
  { name: 'Amplified', filename: 'amplified.svg' },
  { name: 'Viral Vibe', filename: 'viral-vibe.svg' },
  { name: 'Network Hub', filename: 'network-hub.svg' },
  { name: 'Echo Creator', filename: 'echo-creator.svg' },
  { name: 'Magnetic Profile', filename: 'magnetic-profile.svg' },
  { name: 'Spotlight', filename: 'spotlight.svg' },
  { name: 'Rising Star', filename: 'rising-star.svg' },
  { name: 'Golden Mic', filename: 'golden-microphone.svg' },
  { name: 'Spark Plug', filename: 'spark-plug.svg' },
  { name: 'Prism', filename: 'prism.svg' },
  { name: 'Beacon', filename: 'beacon.svg' },
  { name: 'Vibe Check', filename: 'vibe-check.svg' },
  { name: 'Super Fan', filename: 'super-fan.svg' },
  { name: 'Megaphone Neon', filename: 'megaphone-neon.svg' },
  { name: 'High Frequency', filename: 'high-frequency.svg' },
  { name: 'Social Crown', filename: 'social-crown.svg' },
  { name: 'Diamond Status', filename: 'diamond-status.svg' },
  { name: 'Key to Feed', filename: 'key-to-feed.svg' }
];

const CREATOR_ICONS = [
  { name: 'Night Owl', filename: 'night-owl.svg' },
  { name: 'Content Machine', filename: 'content-machine.svg' },
  { name: 'Deep Thinker', filename: 'deep-thinker.svg' },
  { name: 'Streak Master', filename: 'streak-master.svg' },
  { name: 'Media Mogul', filename: 'media-mogul.svg' },
  { name: 'Icebreaker', filename: 'icebreaker.svg' },
  { name: 'Bridge Builder', filename: 'bridge-builder.svg' },
  { name: 'Lighthouse', filename: 'lighthouse.svg' },
  { name: 'Mind Map', filename: 'mind-map.svg' },
  { name: 'Golden Feather', filename: 'golden-feather.svg' },
  { name: 'Infinite Scroll', filename: 'infinite-scroll.svg' },
  { name: 'Hourglass', filename: 'hour-glass.svg' },
  { name: 'Neon Brain', filename: 'neon-brain.svg' },
  { name: 'Catalyst Spark', filename: 'catalyst-spark.svg' },
  { name: 'Peacekeeper', filename: 'peace-keeper.svg' },
  { name: 'Curator', filename: 'curator.svg' },
  { name: 'Early Adopter', filename: 'early-adopter.svg' },
  { name: 'Signal Booster', filename: 'signal-booster.svg' },
  { name: 'Book Worm', filename: 'book-worm.svg' },
  { name: 'Anchor', filename: 'anchor.svg' }
];

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
  const [editingBadgeId, setEditingBadgeId] = useState<number | null>(null);
  const [openMenuBadgeId, setOpenMenuBadgeId] = useState<number | null>(null);
  const [badgeForm, setBadgeForm] = useState({
    name: '',
    description: '',
    imageUrl: '' as string | null,
    metricKey: '',
    operator: '>=' as string,
    threshold: '10',
  });
  const [badgeUploading, setBadgeUploading] = useState(false);
  const [uploadingBadgeId, setUploadingBadgeId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'new' | number | null>(null);
  const [pickerTab, setPickerTab] = useState<'influence' | 'creator'>('influence');

  const [badgesOpen, setBadgesOpen] = useState(false);
  const [pointRulesOpen, setPointRulesOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const [toggleConfirmOpen, setToggleConfirmOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resetting, setResetting] = useState(false);

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

  const handleSelectIcon = async (iconUrl: string) => {
    setPickerOpen(false);
    if (pickerTarget === 'new') {
      setBadgeForm(prev => ({ ...prev, imageUrl: iconUrl }));
    } else if (typeof pickerTarget === 'number') {
      const badgeId = pickerTarget;
      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`${API_URL}/api/admin/gamification/badges/${badgeId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ imageUrl: iconUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update icon');
        setBadges(prev => prev.map(b => (b.id === badgeId ? data : b)));
        setSuccess('Badge icon updated from pack.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update icon');
      } finally {
        setSaving(false);
        setPickerTarget(null);
      }
    }
  };

  const seedStarterBadges = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const origin = window.location.origin;
      const starters = [
        {
          name: 'First Post',
          description: 'You published your first post! Keep sharing your thoughts.',
          imageUrl: `${origin}/badge-packs/influence/trendsetter.svg`,
          metricKey: 'total_posts',
          operator: '>=',
          threshold: 1,
        },
        {
          name: 'Conversation Spark',
          description: 'Wrote 5 helpful comments to participate in discussions.',
          imageUrl: `${origin}/badge-packs/influence/spark-plug.svg`,
          metricKey: 'total_comments',
          operator: '>=',
          threshold: 5,
        },
        {
          name: 'Active Reader',
          description: 'Spent 10 minutes viewing the feed and exploring contents.',
          imageUrl: `${origin}/badge-packs/creator/hour-glass.svg`,
          metricKey: 'total_session_minutes',
          operator: '>=',
          threshold: 10,
        },
        {
          name: 'Super Supporter',
          description: 'Gave 15 likes to support other members.',
          imageUrl: `${origin}/badge-packs/influence/magnetic-profile.svg`,
          metricKey: 'likes_given',
          operator: '>=',
          threshold: 15,
        },
        {
          name: 'Rising Star',
          description: 'Gained 5 followers on your profile.',
          imageUrl: `${origin}/badge-packs/influence/rising-star.svg`,
          metricKey: 'follower_count',
          operator: '>=',
          threshold: 5,
        },
      ];

      for (const badgeData of starters) {
        const res = await fetch(`${API_URL}/api/admin/gamification/badges`, {
          method: 'POST',
          headers,
          body: JSON.stringify(badgeData),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to seed badge: ${badgeData.name}`);
        }
      }

      await loadAll();
      setSuccess('Successfully seeded starter badges!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to seed badges');
    } finally {
      setSaving(false);
    }
  };

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

  const resetProgress = async () => {
    if (resetConfirmInput !== 'RESET') return;
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/maintenance/reset-progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirm: resetConfirmInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset progress');
      setResetModalOpen(false);
      setResetConfirmInput('');
      setSuccess(`Fresh start complete. Reset progress for ${data.usersAffected} user${data.usersAffected === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset progress');
    } finally {
      setResetting(false);
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

  const handleExistingBadgeImage = async (badgeId: number, file: File) => {
    setUploadingBadgeId(badgeId);
    setError(null);
    setSuccess(null);
    try {
      const { url } = await uploadCompressedImage(file, 'badge', token, API_URL);
      const res = await fetch(`${API_URL}/api/admin/gamification/badges/${badgeId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ imageUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update icon');
      setBadges(prev => prev.map(b => (b.id === badgeId ? data : b)));
      setSuccess('Badge icon updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingBadgeId(null);
    }
  };

  const resetBadgeForm = () => {
    setBadgeForm({ name: '', description: '', imageUrl: null, metricKey: '', operator: '>=', threshold: '10' });
    setEditingBadgeId(null);
    setShowCreateBadge(false);
  };

  const openCreateBadge = () => {
    setEditingBadgeId(null);
    setBadgeForm({ name: '', description: '', imageUrl: null, metricKey: '', operator: '>=', threshold: '10' });
    setError(null);
    setSuccess(null);
    setShowCreateBadge(true);
  };

  const openEditBadge = (badge: AdminBadge) => {
    setEditingBadgeId(badge.id);
    setBadgeForm({
      name: badge.name,
      description: badge.description,
      imageUrl: badge.imageUrl,
      metricKey: badge.rule?.metricKey ?? '',
      operator: badge.rule?.operator ?? '>=',
      threshold: badge.rule?.threshold != null ? String(badge.rule.threshold) : '10',
    });
    setError(null);
    setSuccess(null);
    setShowCreateBadge(true);
  };

  const submitBadge = async () => {
    const threshold = parseInt(badgeForm.threshold, 10);
    if (!badgeForm.name.trim() || !badgeForm.metricKey || Number.isNaN(threshold)) {
      setError('Name, metric, and threshold are required.');
      return;
    }
    const isEdit = editingBadgeId != null;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `${API_URL}/api/admin/gamification/badges${isEdit ? `/${editingBadgeId}` : ''}`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers,
          body: JSON.stringify({
            name: badgeForm.name.trim(),
            description: badgeForm.description.trim(),
            imageUrl: badgeForm.imageUrl,
            metricKey: badgeForm.metricKey,
            operator: badgeForm.operator,
            threshold,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${isEdit ? 'update' : 'create'} badge`);
      setBadges(prev => (isEdit ? prev.map(b => (b.id === editingBadgeId ? data : b)) : [...prev, data]));
      resetBadgeForm();
      setSuccess(isEdit ? 'Badge updated.' : 'Badge created.');
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${isEdit ? 'update' : 'create'} badge`);
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

      <section className="rounded-xl border border-border-custom bg-bg-tertiary/30 p-4 space-y-4">
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
            onClick={() => setToggleConfirmOpen(true)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] transition-colors cursor-pointer disabled:opacity-50 ${
              settings?.gamificationEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-bg-primary border border-border-custom text-text-secondary hover:text-text-primary'
            }`}
          >
            {settings?.gamificationEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="pt-3 border-t border-border-custom flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-rose-400">Fresh start</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              Erases every user&apos;s points, level, earned badges, and streaks. Badge, point-rule, and level
              configuration are kept. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => setResetModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold min-h-[44px] border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer transition-colors disabled:opacity-50 shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Erase all data
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setBadgesOpen(prev => !prev)}
          aria-expanded={badgesOpen}
          className="w-full flex items-center justify-between gap-2 cursor-pointer group"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
            Badges
            <span className="text-[10px] font-medium text-text-muted normal-case tracking-normal">({badges.length})</span>
          </h4>
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${badgesOpen ? 'rotate-180' : ''}`} />
        </button>

        {badgesOpen && (
        <>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => (showCreateBadge ? resetBadgeForm() : openCreateBadge())}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New badge
          </button>
        </div>

        {showCreateBadge && (
          <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-4 space-y-3">
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
              {editingBadgeId != null ? 'Edit badge' : 'New badge'}
            </p>
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
            <div className="flex items-center gap-3 flex-wrap">
              {badgeForm.imageUrl ? (
                <img src={badgeForm.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-xl border border-dashed border-border-custom flex items-center justify-center">
                  <Upload className="h-4 w-4 text-text-muted" />
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
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
                <button
                  type="button"
                  onClick={() => {
                    setPickerTarget('new');
                    setPickerOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 cursor-pointer transition-colors"
                >
                  <Award className="h-3.5 w-3.5" />
                  Choose from Packs
                </button>
              </div>
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
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitBadge()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
              >
                {editingBadgeId != null ? 'Save changes' : 'Create badge'}
              </button>
              <button
                type="button"
                onClick={resetBadgeForm}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-border-custom text-text-secondary hover:bg-bg-tertiary cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {badges.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-custom p-6 text-center space-y-3">
              <p className="text-xs text-text-muted">No badges configured.</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void seedStarterBadges()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Seed Starter Badges
              </button>
            </div>
          ) : (
            badges.map(badge => (
              <div
                key={badge.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-border-custom bg-bg-tertiary/40"
              >
                <div className="relative shrink-0">
                  {badge.imageUrl ? (
                    <img src={badge.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
                      <Award className="h-5 w-5 text-amber-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium text-text-primary truncate">{badge.name}</p>
                  <p className="text-[10px] text-text-muted truncate">
                    {uploadingBadgeId === badge.id
                      ? 'Uploading icon…'
                      : badge.rule
                        ? `${badge.rule.metricKey} ${badge.rule.operator} ${badge.rule.threshold}`
                        : 'No rule'}
                  </p>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenMenuBadgeId(prev => (prev === badge.id ? null : badge.id))}
                    aria-haspopup="menu"
                    aria-expanded={openMenuBadgeId === badge.id}
                    aria-label="Badge actions"
                    className="p-2 rounded-lg text-text-muted hover:bg-bg-tertiary hover:text-text-primary cursor-pointer transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenuBadgeId === badge.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuBadgeId(null)} />
                      <div
                        role="menu"
                        className="absolute right-0 top-full mt-1 z-20 min-w-[190px] py-1 rounded-xl border border-border-custom bg-bg-secondary shadow-lg"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuBadgeId(null);
                            openEditBadge(badge);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit details
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuBadgeId(null);
                            setPickerTarget(badge.id);
                            setPickerOpen(true);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                        >
                          <Grid className="h-3.5 w-3.5" />
                          Choose icon from packs
                        </button>
                        <label
                          role="menuitem"
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {uploadingBadgeId === badge.id ? 'Uploading…' : 'Upload icon'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={uploadingBadgeId === badge.id}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              setOpenMenuBadgeId(null);
                              if (file) void handleExistingBadgeImage(badge.id, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={saving}
                          onClick={() => {
                            setOpenMenuBadgeId(null);
                            void deleteBadge(badge.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Deactivate
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        </>
        )}
      </section>

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setPointRulesOpen(prev => !prev)}
          aria-expanded={pointRulesOpen}
          className="w-full flex items-center justify-between gap-2 cursor-pointer group"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Point rules</h4>
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${pointRulesOpen ? 'rotate-180' : ''}`} />
        </button>
        {pointRulesOpen && (
        <>
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
        </>
        )}
      </section>

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setLevelsOpen(prev => !prev)}
          aria-expanded={levelsOpen}
          className="w-full flex items-center justify-between gap-2 cursor-pointer group"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Level thresholds</h4>
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${levelsOpen ? 'rotate-180' : ''}`} />
        </button>
        {levelsOpen && (
        <>
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
        </>
        )}
      </section>

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setMetricsOpen(prev => !prev)}
          aria-expanded={metricsOpen}
          className="w-full flex items-center justify-between gap-2 cursor-pointer group"
        >
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Metric catalog</h4>
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${metricsOpen ? 'rotate-180' : ''}`} />
        </button>
        {metricsOpen && (
        <>
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
        </>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">User support</h4>
        <p className="text-[10px] text-text-muted">
          Inspect counters, badges, and recent ledger. Manual award/revoke for support cases.
        </p>
        <AdminUserGamificationView token={token} badges={badges} />
      </section>

      {toggleConfirmOpen && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border-custom bg-bg-secondary shadow-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-text-primary">
                Turn gamification {settings.gamificationEnabled ? 'off' : 'on'}?
              </h3>
            </div>
            <p className="text-xs text-text-muted">
              {settings.gamificationEnabled
                ? 'Users will stop earning points, levels, and badges. Their existing progress stays visible.'
                : 'Users will resume earning points, levels, and badges immediately.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setToggleConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  void toggleEnabled();
                  setToggleConfirmOpen(false);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold min-h-[44px] cursor-pointer transition-colors disabled:opacity-50 ${
                  settings.gamificationEnabled
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {settings.gamificationEnabled ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-bg-secondary shadow-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-text-primary">Erase all gamification progress?</h3>
            </div>
            <p className="text-xs text-text-muted">
              This permanently deletes every user&apos;s points, level, earned badges, points ledger, streaks, and
              event participation. Configured badges, point rules, level thresholds, and events are kept.
              <span className="block mt-1.5 font-semibold text-rose-400">This action cannot be undone.</span>
            </p>
            <div>
              <label htmlFor="reset-confirm-input" className="block text-[11px] font-medium text-text-secondary mb-1.5">
                Type <span className="font-mono font-bold text-rose-400">RESET</span> to confirm
              </label>
              <input
                id="reset-confirm-input"
                type="text"
                autoComplete="off"
                value={resetConfirmInput}
                onChange={e => setResetConfirmInput(e.target.value)}
                placeholder="RESET"
                className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={resetting}
                onClick={() => {
                  setResetModalOpen(false);
                  setResetConfirmInput('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmInput !== 'RESET' || resetting}
                onClick={() => void resetProgress()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {resetting ? 'Erasing…' : 'Erase everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border-custom bg-bg-secondary shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-panel-pop-anchor">
            <div className="p-4 border-b border-border-custom flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-indigo-400" />
                  Select Badge Icon
                </h3>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Choose a high-quality icon from our pre-designed packs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex border-b border-border-custom bg-bg-primary/20">
              <button
                type="button"
                onClick={() => setPickerTab('influence')}
                className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  pickerTab === 'influence'
                    ? 'border-indigo-500 text-indigo-400 bg-bg-tertiary/20'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                Influence & Virality (20)
              </button>
              <button
                type="button"
                onClick={() => setPickerTab('creator')}
                className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  pickerTab === 'creator'
                    ? 'border-indigo-500 text-indigo-400 bg-bg-tertiary/20'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                Creator & Engagement (20)
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {(pickerTab === 'influence' ? INFLUENCE_ICONS : CREATOR_ICONS).map(icon => {
                  const iconUrl = `${window.location.origin}/badge-packs/${pickerTab}/${icon.filename}`;
                  return (
                    <button
                      key={icon.filename}
                      type="button"
                      onClick={() => void handleSelectIcon(iconUrl)}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-border-custom bg-bg-tertiary/20 hover:bg-indigo-500/10 hover:border-indigo-500/40 cursor-pointer transition-all duration-200 group text-center"
                    >
                      <div className="h-12 w-12 flex items-center justify-center bg-bg-primary rounded-lg border border-border-custom group-hover:scale-110 transition-transform">
                        <img
                          src={iconUrl}
                          alt={icon.name}
                          className="h-10 w-10 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <span className="text-[9px] font-medium text-text-secondary group-hover:text-indigo-400 truncate max-w-full">
                        {icon.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-bg-primary/30 border-t border-border-custom flex justify-end">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-border-custom bg-bg-secondary hover:bg-bg-tertiary text-text-primary cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
