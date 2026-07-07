import { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronDown, Pencil, Plus, Trash2, Upload } from 'lucide-react';
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

type EventForm = {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: 'draft' | 'active' | 'ended';
  bannerUrl: string | null;
  metricKey: string;
  winType: EventWinType;
  topN: string;
  threshold: string;
  count: string;
  prizeType: 'badge' | 'points' | 'title';
  prizeRef: string;
};

const EMPTY_FORM: EventForm = {
  name: '',
  description: '',
  startsAt: '',
  endsAt: '',
  status: 'draft',
  bannerUrl: '',
  metricKey: 'total_comments',
  winType: 'leaderboard',
  topN: '5',
  threshold: '10',
  count: '3',
  prizeType: 'badge',
  prizeRef: '',
};

function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formToEventBody(form: EventForm) {
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

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    status: form.status,
    bannerUrl: form.bannerUrl || null,
    requiresOptIn: true,
    rules: [{
      metricKey: form.metricKey,
      winType: form.winType,
      config: buildRuleConfig(),
    }],
  };
}

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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  const metricLabel = useCallback(
    (key: string) => metrics?.metrics.find((m) => m.key === key)?.label ?? key,
    [metrics],
  );

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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const openEdit = (event: AdminEvent) => {
    const rule = event.rules[0];
    const config = rule?.config;
    setForm({
      name: event.name,
      description: event.description,
      startsAt: toDatetimeLocal(event.startsAt),
      endsAt: toDatetimeLocal(event.endsAt),
      status: event.status,
      bannerUrl: event.bannerUrl ?? '',
      metricKey: rule?.metricKey ?? 'total_comments',
      winType: rule?.winType ?? 'leaderboard',
      topN: config?.topN != null ? String(config.topN) : '5',
      threshold: config?.threshold != null ? String(config.threshold) : '10',
      count: config?.count != null ? String(config.count) : '3',
      prizeType: config?.prizeType ?? 'badge',
      prizeRef: config?.prizeRef ?? '',
    });
    setEditingId(event.id);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.description.trim()) {
      setError('Name and description are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const isEdit = editingId != null;
      const res = await fetch(
        `${API_URL}/api/admin/gamification/events${isEdit ? `/${editingId}` : ''}`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers,
          body: JSON.stringify(formToEventBody(form)),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save event');
      setSuccess(isEdit ? 'Event updated' : 'Event created');
      closeForm();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (eventId: number, status: 'active' | 'ended') => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/events/${eventId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      setSuccess(status === 'active' ? 'Event activated' : 'Event ended');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (event: AdminEvent) => {
    if (!confirm(`Delete "${event.name}"? This removes the event, its rules, participants, and recorded wins. This cannot be undone.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/gamification/events/${event.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      setSuccess('Event deleted');
      if (expandedId === event.id) setExpandedId(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
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
          onClick={() => (showForm && editingId == null ? closeForm() : openCreate())}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          New event
        </button>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && <p className="text-sm text-emerald-500">{success}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border-custom p-4 space-y-3 bg-bg-primary/30">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            {editingId != null ? 'Edit event' : 'Create event'}
          </p>
          <div>
            <input
              className="w-full px-3 py-2 rounded-lg border border-border-custom bg-bg-secondary text-sm"
              placeholder="Event name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-border-custom bg-bg-secondary text-sm resize-none"
              placeholder="Description * (shown to users on the event details)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              required
            />
            <p className="text-[10px] text-text-muted mt-1">Name and description are both required.</p>
          </div>
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
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs text-text-muted flex flex-col">
              Metric
              <select
                className="mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                value={form.metricKey}
                onChange={(e) => setForm((f) => ({ ...f, metricKey: e.target.value }))}
              >
                {metrics?.metrics.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted flex flex-col">
              Win type
              <select
                className="mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                value={form.winType}
                onChange={(e) => setForm((f) => ({ ...f, winType: e.target.value as EventWinType }))}
              >
                {WIN_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            {form.winType === 'leaderboard' && (
              <label className="text-xs text-text-muted flex flex-col">
                Top N
                <input
                  type="number"
                  min={1}
                  className="w-20 mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                  value={form.topN}
                  onChange={(e) => setForm((f) => ({ ...f, topN: e.target.value }))}
                />
              </label>
            )}
            {form.winType !== 'leaderboard' && (
              <label className="text-xs text-text-muted flex flex-col">
                Threshold
                <input
                  type="number"
                  min={1}
                  className="w-24 mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                  value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                />
              </label>
            )}
            {form.winType === 'first_to_n' && (
              <label className="text-xs text-text-muted flex flex-col">
                Count
                <input
                  type="number"
                  min={1}
                  className="w-20 mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                  value={form.count}
                  onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
                />
              </label>
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
          {editingId != null && (
            <label className="text-xs text-text-muted flex flex-col w-40">
              Status
              <select
                className="mt-1 px-2 py-1.5 rounded-lg border border-border-custom bg-bg-secondary text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EventForm['status'] }))}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="ended">ended</option>
              </select>
            </label>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {form.bannerUrl ? (
              <img src={form.bannerUrl} alt="" className="h-12 w-20 rounded-lg object-cover border border-border-custom" />
            ) : (
              <div className="h-12 w-20 rounded-lg border border-dashed border-border-custom flex items-center justify-center">
                <Upload className="h-4 w-4 text-text-muted" />
              </div>
            )}
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary">
                <Upload className="w-3.5 h-3.5" />
                {bannerUploading ? 'Uploading…' : 'Upload banner'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={bannerUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleBannerUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {form.bannerUrl && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, bannerUrl: '' }))}
                className="text-[11px] text-rose-400 hover:underline cursor-pointer"
              >
                Remove banner
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Create event'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 rounded-lg border border-border-custom text-sm cursor-pointer hover:bg-bg-tertiary transition-colors"
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
          {events.map((event) => {
            const expanded = expandedId === event.id;
            const rule = event.rules[0];
            return (
              <li key={event.id} className="rounded-xl border border-border-custom bg-bg-tertiary/30 overflow-hidden">
                <div className="p-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : event.id)}
                    aria-expanded={expanded}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    <span className="min-w-0">
                      <span className="block font-medium text-text-primary truncate">{event.name}</span>
                      <span className="block text-xs text-text-muted">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1.5 ${
                          event.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : event.status === 'ended'
                              ? 'bg-bg-primary text-text-muted'
                              : 'bg-amber-500/15 text-amber-400'
                        }`}>
                          {event.status}
                        </span>
                        {new Date(event.startsAt).toLocaleDateString()} – {new Date(event.endsAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {event.status === 'draft' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setStatus(event.id, 'active')}
                        className="px-3 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        Activate
                      </button>
                    )}
                    {event.status === 'active' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void setStatus(event.id, 'ended')}
                        className="px-3 py-1 text-xs rounded-lg border border-border-custom hover:bg-bg-tertiary text-text-secondary disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        End
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(event)}
                      className="p-2 rounded-lg text-indigo-400 hover:bg-indigo-500/10 cursor-pointer transition-colors"
                      aria-label="Edit event"
                      title="Edit event"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void deleteEvent(event)}
                      className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 cursor-pointer transition-colors"
                      aria-label="Delete event"
                      title="Delete event"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border-custom p-3 space-y-3 text-sm">
                    {event.bannerUrl && (
                      <img src={event.bannerUrl} alt="" className="w-full max-h-40 rounded-lg object-cover border border-border-custom" />
                    )}
                    <div>
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Description</p>
                      <p className="text-text-secondary whitespace-pre-line">{event.description || '—'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Starts</p>
                        <p className="text-text-secondary">{new Date(event.startsAt).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Ends</p>
                        <p className="text-text-secondary">{new Date(event.endsAt).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Opt-in required</p>
                        <p className="text-text-secondary">{event.requiresOptIn ? 'Yes' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Created</p>
                        <p className="text-text-secondary">{new Date(event.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {rule && (
                      <div>
                        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Win rule</p>
                        <div className="rounded-lg border border-border-custom bg-bg-primary/30 p-2.5 space-y-1 text-xs text-text-secondary">
                          <p>Metric: <span className="text-text-primary">{metricLabel(rule.metricKey)}</span></p>
                          <p>Win type: <span className="text-text-primary">{rule.winType}</span></p>
                          {rule.config.topN != null && <p>Top N: <span className="text-text-primary">{rule.config.topN}</span></p>}
                          {rule.config.threshold != null && <p>Threshold: <span className="text-text-primary">{rule.config.threshold}</span></p>}
                          {rule.config.count != null && <p>Count: <span className="text-text-primary">{rule.config.count}</span></p>}
                          <p>Prize: <span className="text-text-primary">{rule.config.prizeType}{rule.config.prizeRef ? ` · ${rule.config.prizeRef}` : ''}</span></p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
