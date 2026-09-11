import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Search, Trash2 } from 'lucide-react';
import type { VideoCallAllowlistEntry, VideoCallAllowlistSearchResult } from '@hin/types';
import { API_URL } from '../../config';
import { UserAvatar } from '../profile/UserAvatar';

interface AdminVideoCallsProps {
  token: string;
}

export function AdminVideoCalls({ token }: AdminVideoCallsProps) {
  const [entries, setEntries] = useState<VideoCallAllowlistEntry[]>([]);
  const [videoCallsEnabled, setVideoCallsEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VideoCallAllowlistSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingUserId, setAddingUserId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/video-calls/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load call settings');
      setVideoCallsEnabled(!!data.videoCallsEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load call settings');
    } finally {
      setSettingsLoading(false);
    }
  }, [token]);

  const loadAllowlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/video-calls/allowlist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load allowlist');
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load allowlist');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSettings();
    void loadAllowlist();
  }, [loadAllowlist, loadSettings]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdownOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `${API_URL}/api/admin/video-calls/users/search?q=${encodeURIComponent(trimmed)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (res.ok) {
          setSearchResults(data.results ?? []);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, token]);

  const applyEnabled = async (next: boolean) => {
    setTogglingEnabled(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/video-calls/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ videoCallsEnabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update call settings');
      setVideoCallsEnabled(!!data.videoCallsEnabled);
      setSuccess(next ? 'Voice and video calls enabled' : 'Voice and video calls disabled');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update call settings');
    } finally {
      setTogglingEnabled(false);
      setConfirmDisable(false);
    }
  };

  const handleToggleEnabled = (next: boolean) => {
    if (!next) {
      setConfirmDisable(true);
      return;
    }
    void applyEnabled(true);
  };

  const handleAddUser = async (user: VideoCallAllowlistSearchResult) => {
    if (user.alreadyAllowlisted || addingUserId != null) return;

    setAddingUserId(user.userId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/video-calls/allowlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add user');

      const entry = data.entry as VideoCallAllowlistEntry;
      setEntries(prev => {
        if (prev.some(e => e.userId === entry.userId)) return prev;
        return [entry, ...prev];
      });
      setSearchResults(prev => prev.map(r => (
        r.userId === user.userId ? { ...r, alreadyAllowlisted: true } : r
      )));
      setQuery('');
      setDropdownOpen(false);
      setSuccess(`Added ${entry.username} to the call allowlist`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add user');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRemove = async (userId: number, username: string) => {
    setRemovingId(userId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/video-calls/allowlist/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove user');
      setSuccess(`Removed ${username} from allowlist`);
      setEntries(prev => prev.filter(e => e.userId !== userId));
      setSearchResults(prev => prev.map(r => (
        r.userId === userId ? { ...r, alreadyAllowlisted: false } : r
      )));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove user');
    } finally {
      setRemovingId(null);
    }
  };

  const showingSearch = query.trim().length >= 2;

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between max-w-lg p-3.5 rounded-xl border border-border-custom bg-bg-primary">
        <div className="space-y-0.5 pr-3">
          <span className="text-xs font-medium text-text-secondary block">Enable voice &amp; video calls</span>
          <span className="text-[10px] text-text-muted block">
            Master switch for 1:1 calling. Allowlisted users can start calls from chat; anyone can answer.
          </span>
        </div>
        <button
          type="button"
          disabled={settingsLoading || togglingEnabled}
          onClick={() => handleToggleEnabled(!videoCallsEnabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
            videoCallsEnabled ? 'bg-indigo-600' : 'bg-zinc-700'
          }`}
          aria-pressed={videoCallsEnabled}
          aria-label="Toggle voice and video calls"
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              videoCallsEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <p className="text-xs text-text-muted leading-relaxed">
        Search for users below to allow voice or video calls from DM chat headers.
      </p>

      <div ref={searchContainerRef} className="relative max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Search by username or email…"
            disabled={!videoCallsEnabled}
            className="w-full min-h-[44px] pl-10 pr-3 py-2 rounded-xl border border-border-custom bg-bg-primary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            aria-expanded={dropdownOpen && showingSearch}
            aria-controls="video-call-allowlist-search-results"
            autoComplete="off"
          />
        </div>

        {dropdownOpen && (
          <div
            id="video-call-allowlist-search-results"
            className="absolute z-20 mt-1 w-full rounded-xl border border-border-custom bg-bg-secondary shadow-xl overflow-hidden"
          >
            {!showingSearch ? (
              <p className="px-3 py-3 text-[11px] text-text-muted">Type at least 2 characters to search.</p>
            ) : searching ? (
              <p className="px-3 py-4 text-[11px] text-text-muted text-center">Searching…</p>
            ) : searchResults.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-text-muted text-center">No users found</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y divide-border-custom/60">
                {searchResults.map(user => (
                  <li
                    key={user.userId}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      user.alreadyAllowlisted ? 'opacity-60 bg-bg-primary/30' : 'hover:bg-bg-primary/50'
                    }`}
                  >
                    <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-text-primary truncate">@{user.username}</p>
                      {user.email && (
                        <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                      )}
                    </div>
                    {user.alreadyAllowlisted ? (
                      <span className="text-[10px] font-semibold text-text-muted px-2 py-1 rounded-full bg-bg-tertiary">
                        Added
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleAddUser(user)}
                        disabled={addingUserId === user.userId || !videoCallsEnabled}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                      >
                        {addingUserId === user.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}

      {loading ? (
        <p className="text-xs text-text-muted py-4">Loading allowlist…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-text-muted py-4">No users on the call allowlist yet.</p>
      ) : (
        <ul className="divide-y divide-border-custom/60 rounded-xl border border-border-custom overflow-hidden">
          {entries.map(entry => (
            <li
              key={entry.userId}
              className="flex items-center gap-3 px-3 py-2.5 bg-bg-primary/40 hover:bg-bg-primary/70 transition-colors"
            >
              <UserAvatar username={entry.username} avatarUrl={entry.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary truncate">{entry.username}</p>
                {entry.email && (
                  <p className="text-[10px] text-text-muted truncate">{entry.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(entry.userId, entry.username)}
                disabled={removingId === entry.userId}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                aria-label={`Remove ${entry.username} from allowlist`}
              >
                {removingId === entry.userId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border-custom bg-bg-secondary shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-semibold text-text-primary">Disable voice &amp; video calls?</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Calling is disabled platform-wide. Call buttons hide for everyone; active calls should end.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisable(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-bg-tertiary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={togglingEnabled}
                onClick={() => void applyEnabled(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50"
              >
                {togglingEnabled ? 'Disabling…' : 'Disable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
