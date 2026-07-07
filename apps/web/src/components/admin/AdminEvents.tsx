import { useCallback, useEffect, useState } from 'react';
import { Calendar, Plus, Upload } from 'lucide-react';
import type {
  AdminEvent,
  EventWinType,
  MetricCatalogResponse,
} from '@hin/types';
import { API_URL } from '../../config';
import { uploadCompressedImage } from '../../lib/compressImage';

interface AdminEventsProps {
  token: string;
}

const WIN_TYPES: EventWinType[] = ['leaderboard', 'first_to_n', 'threshold'];

export function AdminEvents({ token }: AdminEventsProps) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [metrics, setMetrics] = useState<MetricCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    startsAt: '',
    endsAt: '',
    status: 'draft' as 'draft' | 'active' | 'ended',
    bannerUrl: '' as string | null,
    metricKey: 'total_comments',
    winType: 'leaderboard' as EventWinType,
    topN: '5',
    threshold: '10',
    count: '3',
    prizeType: 'badge' as 'badge' | 'points' | 'title',
    prizeRef: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, metricsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/gamification/events`, { headers }),
        fetch(`${API_URL}/api/admin/gamification/metrics`, { headers }),
      ]);
      if (!eventsRes.ok || !metricsRes.ok) throw new Error('Failed to load events');
      const eventsData = await eventsRes.json() as { events: AdminEvent[] };
      setEvents(eventsData.events);
      setMetrics(await metricsRes.json() as MetricCatalogResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleBannerUpload = async (file: File) => {
    setBannerUploading(true);
    try {
      const result = await uploadCompressedImage(file, 'event_banner', token, API_URL);
      setForm((f) => ({ ...f, bannerUrl: result.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBannerUploading(false);
    }
  };

  const buildRuleConfig = () => {
    if (form.winType === 'leaderboard') {
      return {
        topN: parseInt(form.topN, 10) || 5,
        prizeType: form.prizeType,
        prizeRef: form.prizeRef || undefined,
      };
    }
    if (form.winType === 'first_to_n') {
      return {
        count: parseInt(form.count, 10) || 3,
        threshold: parseInt(form.threshold, 10) || 10,
        prizeType: form.prizeType,
        prizeRef: form.prizeRef || undefined,
      };
    }
    return {
      threshold: parseInt(form.threshold, 10) || 10,
      prizeType: form.prizeType,
      prizeRef: form.prizeRef || undefined,
    };
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          status: form.status,
          bannerUrl: form.bannerUrl,
          requiresOptIn: true,
          rules: [{
            metricKey: form.metricKey,
            winType: form.winType,
            config: buildRuleConfig(),
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create event');
      setSuccess('Event created');
      setShowCreate(false);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const activateEvent = async (eventId: number) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/events/${eventId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'active' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to activate');
      }
      setSuccess('Event activated');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to activate');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-text-muted p-4">Loading events…</p>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Events
        </h3>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-accent text-white"
        >
          <Plus className="w-4 h-4" />
          New event
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-500">{success}</p>}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border-custom p-4 space-y-3 bg-bg-primary/30">
          <input
            className="w-full px-3 py-2 rounded-lg border border-border-custom bg-bg-secondary text-sm"
            placeholder="Event name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-border-custom bg-bg-secondary text-sm"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-text-muted">
              Starts
              <input
                type="datetime-local"
                className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                required
              />
            </label>
            <label className="text-xs text-text-muted">
              Ends
              <input
                type="datetime-local"
                className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                value={form.endsAt}
                onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                required
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
              value={form.metricKey}
              onChange={(e) => setForm((f) => ({ ...f, metricKey: e.target.value }))}
            >
              {metrics?.metrics.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <select
              className="px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
              value={form.winType}
              onChange={(e) => setForm((f) => ({ ...f, winType: e.target.value as EventWinType }))}
            >
              {WIN_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {form.winType === 'leaderboard' && (
              <input
                type="number"
                min={1}
                className="w-20 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                placeholder="Top N"
                value={form.topN}
                onChange={(e) => setForm((f) => ({ ...f, topN: e.target.value }))}
              />
            )}
            {form.winType !== 'leaderboard' && (
              <input
                type="number"
                min={1}
                className="w-24 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                placeholder="Threshold"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
              />
            )}
            {form.winType === 'first_to_n' && (
              <input
                type="number"
                min={1}
                className="w-20 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                placeholder="Count"
                value={form.count}
                onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
              />
            )}
          </div>
          <div className="flex gap-2 items-center">
            <select
              className="px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
              value={form.prizeType}
              onChange={(e) => setForm((f) => ({ ...f, prizeType: e.target.value as 'badge' | 'points' | 'title' }))}
            >
              <option value="badge">Badge prize</option>
              <option value="points">Points prize</option>
              <option value="title">Title prize</option>
            </select>
            <input
              className="flex-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
              placeholder="Prize ref (badge id or points)"
              value={form.prizeRef}
              onChange={(e) => setForm((f) => ({ ...f, prizeRef: e.target.value }))}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              className="text-xs"
              disabled={bannerUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleBannerUpload(file);
              }}
            />
            {bannerUploading && <span className="text-text-muted">Uploading…</span>}
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create event'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border border-border-custom text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-text-muted">No events yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-border-custom p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-text-primary truncate">{event.name}</p>
                <p className="text-xs text-text-muted">
                  {event.status} · {new Date(event.startsAt).toLocaleDateString()} – {new Date(event.endsAt).toLocaleDateString()}
                </p>
              </div>
              {event.status === 'draft' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void activateEvent(event.id)}
                  className="shrink-0 px-3 py-1 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                >
                  Activate
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
