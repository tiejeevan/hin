import { useEffect, useState } from 'react';
import { Settings, AlertTriangle } from 'lucide-react';
import { DEFAULT_SYSTEM_SETTINGS, SYSTEM_SETTING_BOUNDS, SystemSettings } from '@hin/types';
import { API_URL } from '../../config';

interface AdminUserSettingsProps {
  token: string;
}

type FormState = {
  maxPinnedPostsPerUser: string;
  maxPostLength: string;
  maxMediaPerPost: string;
  turnstileEnabled: boolean;
};

function settingsToForm(settings: SystemSettings): FormState {
  return {
    maxPinnedPostsPerUser: String(settings.maxPinnedPostsPerUser),
    maxPostLength: String(settings.maxPostLength),
    maxMediaPerPost: String(settings.maxMediaPerPost),
    turnstileEnabled: !!settings.turnstileEnabled,
  };
}

export function AdminUserSettings({ token }: AdminUserSettingsProps) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [form, setForm] = useState<FormState>(settingsToForm(DEFAULT_SYSTEM_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingTurnstileValue, setPendingTurnstileValue] = useState(false);

  const handleToggleTurnstileClick = () => {
    setPendingTurnstileValue(!form.turnstileEnabled);
    setShowConfirmModal(true);
  };

  const handleConfirmTurnstileToggle = () => {
    setForm(prev => ({ ...prev, turnstileEnabled: pendingTurnstileValue }));
    setShowConfirmModal(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json() as SystemSettings;
        if (!cancelled) {
          setSettings(data);
          setForm(settingsToForm(data));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSave = async () => {
    const maxPinnedPostsPerUser = parseInt(form.maxPinnedPostsPerUser, 10);
    const maxPostLength = parseInt(form.maxPostLength, 10);
    const maxMediaPerPost = parseInt(form.maxMediaPerPost, 10);
    const turnstileEnabled = form.turnstileEnabled;

    if (
      Number.isNaN(maxPinnedPostsPerUser)
      || maxPinnedPostsPerUser < SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.min
      || maxPinnedPostsPerUser > SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.max
    ) {
      setError(`Pinned posts must be between ${SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.min} and ${SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.max}`);
      return;
    }
    if (
      Number.isNaN(maxPostLength)
      || maxPostLength < SYSTEM_SETTING_BOUNDS.maxPostLength.min
      || maxPostLength > SYSTEM_SETTING_BOUNDS.maxPostLength.max
    ) {
      setError(`Post length must be between ${SYSTEM_SETTING_BOUNDS.maxPostLength.min} and ${SYSTEM_SETTING_BOUNDS.maxPostLength.max}`);
      return;
    }
    if (
      Number.isNaN(maxMediaPerPost)
      || maxMediaPerPost < SYSTEM_SETTING_BOUNDS.maxMediaPerPost.min
      || maxMediaPerPost > SYSTEM_SETTING_BOUNDS.maxMediaPerPost.max
    ) {
      setError(`Media per post must be between ${SYSTEM_SETTING_BOUNDS.maxMediaPerPost.min} and ${SYSTEM_SETTING_BOUNDS.maxMediaPerPost.max}`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          maxPinnedPostsPerUser,
          maxPostLength,
          maxMediaPerPost,
          turnstileEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      setSettings(data);
      setForm(settingsToForm(data));
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-text-muted p-4">Loading platform settings…</p>;
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">Platform settings</h3>
      </div>
      <p className="text-xs text-text-muted">
        Platform-wide limits that apply to all users.
      </p>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">Settings saved.</p>}

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">User limits</h4>
        <label className="block space-y-2 max-w-xs">
          <span className="text-xs font-medium text-text-secondary">Max pinned posts per user</span>
          <input
            type="number"
            min={SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.min}
            max={SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.max}
            value={form.maxPinnedPostsPerUser}
            onChange={e => setForm(prev => ({ ...prev, maxPinnedPostsPerUser: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
          />
          <span className="text-[10px] text-text-muted">Set to 0 to disable pinning.</span>
        </label>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Post limits</h4>
        <label className="block space-y-2 max-w-xs">
          <span className="text-xs font-medium text-text-secondary">Max post length (characters)</span>
          <input
            type="number"
            min={SYSTEM_SETTING_BOUNDS.maxPostLength.min}
            max={SYSTEM_SETTING_BOUNDS.maxPostLength.max}
            value={form.maxPostLength}
            onChange={e => setForm(prev => ({ ...prev, maxPostLength: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
          />
        </label>
        <label className="block space-y-2 max-w-xs">
          <span className="text-xs font-medium text-text-secondary">Max media per post</span>
          <input
            type="number"
            min={SYSTEM_SETTING_BOUNDS.maxMediaPerPost.min}
            max={SYSTEM_SETTING_BOUNDS.maxMediaPerPost.max}
            value={form.maxMediaPerPost}
            onChange={e => setForm(prev => ({ ...prev, maxMediaPerPost: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary"
          />
          <span className="text-[10px] text-text-muted">Set to 0 to disable media attachments.</span>
        </label>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Security settings</h4>
        <div className="flex items-center justify-between max-w-xs p-3.5 rounded-xl border border-border-custom bg-bg-primary">
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-text-secondary block">Cloudflare Turnstile</span>
            <span className="text-[10px] text-text-muted block">Enforce bot protection on login/signup.</span>
          </div>
          <button
            type="button"
            onClick={handleToggleTurnstileClick}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              form.turnstileEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                form.turnstileEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors cursor-pointer min-h-[44px]"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>

      {settings && (
        <p className="text-[10px] text-text-muted">
          Current limits: {settings.maxPinnedPostsPerUser} pinned post{settings.maxPinnedPostsPerUser === 1 ? '' : 's'},
          {' '}{settings.maxPostLength} characters,
          {' '}{settings.maxMediaPerPost} media file{settings.maxMediaPerPost === 1 ? '' : 's'} per post.
          {' '}Cloudflare Turnstile is {settings.turnstileEnabled ? 'enabled' : 'disabled'}.
        </p>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl border border-border-custom bg-bg-secondary shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-semibold text-text-primary">
                {pendingTurnstileValue ? 'Enable bot protection?' : 'Disable bot protection?'}
              </h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              {pendingTurnstileValue
                ? 'Enabling Cloudflare Turnstile adds a secure, non-intrusive bot verification challenge to the login and registration pages. Please ensure that VITE_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are correctly configured.'
                : 'Disabling Cloudflare Turnstile removes the bot verification challenge on the login and registration pages. This makes the platform more vulnerable to automated spam registrations and brute-force attempts.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTurnstileToggle}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer transition-colors min-h-[44px]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
