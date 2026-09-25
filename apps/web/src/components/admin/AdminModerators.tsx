import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModeratorDetail, ModeratorSummary, PermissionKey } from '@hin/types';
import { DEFAULT_MODERATOR_PERMISSIONS } from '@hin/types';
import { API_URL } from '../../config';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { adminUserSearchShouldRun, normalizeAdminUserSearchQuery } from '../../lib/userSearch';
import { ModeratorPermissionsEditor } from './ModeratorPermissionsEditor';

type PromoteCandidate = { id: number; username: string; role: 'user' };

interface AdminModeratorsProps {
  token: string;
}

export function AdminModerators({ token }: AdminModeratorsProps) {
  const [moderators, setModerators] = useState<ModeratorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModeratorDetail | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<PromoteCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PromoteCandidate | null>(null);
  const [promoteStep, setPromoteStep] = useState<'pick' | 'permissions'>('pick');
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const moderatorsInflightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (moderatorsInflightRef.current) return moderatorsInflightRef.current;

    moderatorsInflightRef.current = (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/admin/moderators`, { headers });
        if (!res.ok) throw new Error('Failed to load moderators');
        const data = await res.json();
        setModerators(data.moderators ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
        moderatorsInflightRef.current = null;
      }
    })();

    return moderatorsInflightRef.current;
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const normalized = normalizeAdminUserSearchQuery(debouncedSearch);
    if (!adminUserSearchShouldRun(normalized)) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/admin/users/search?q=${encodeURIComponent(debouncedSearch.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          if (!cancelled) setSearchResults([]);
          return;
        }
        const data = (await res.json()) as { users?: PromoteCandidate[] };
        if (!cancelled) setSearchResults(data.users ?? []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, token]);

  const openEdit = async (id: number) => {
    const res = await fetch(`${API_URL}/api/admin/moderators/${id}`, { headers });
    if (!res.ok) return;
    setEditing(await res.json());
  };

  const savePermissions = async (keys: PermissionKey[]) => {
    if (!editing) return;
    setBusyId(editing.id);
    const res = await fetch(`${API_URL}/api/admin/moderators/${editing.id}/permissions`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ permissionKeys: keys }),
    });
    setBusyId(null);
    if (res.ok) {
      setEditing(null);
      await load();
    }
  };

  const setStatus = async (id: number, status: 'active' | 'suspended') => {
    setBusyId(id);
    await fetch(`${API_URL}/api/admin/moderators/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    await load();
  };

  const removeRole = async (id: number) => {
    if (!confirm('Remove moderator role? Permissions will be kept for history but inactive.')) return;
    setBusyId(id);
    await fetch(`${API_URL}/api/admin/moderators/${id}`, { method: 'DELETE', headers });
    setBusyId(null);
    await load();
  };

  const resetPromoteFlow = () => {
    setPromoteStep('pick');
    setPromoteError(null);
  };

  const promote = async (permissionKeys: PermissionKey[]) => {
    if (!selectedUser) return;
    setPromoteBusy(true);
    setPromoteError(null);
    const res = await fetch(`${API_URL}/api/admin/moderators`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: selectedUser.id, permissionKeys }),
    });
    const data = await res.json().catch(() => ({}));
    setPromoteBusy(false);
    if (res.ok) {
      setSearchQuery('');
      setSelectedUser(null);
      setSearchResults([]);
      resetPromoteFlow();
      await load();
    } else {
      setPromoteError(data.error || 'Failed to promote user');
    }
  };

  const searchHint = (() => {
    const q = debouncedSearch.trim();
    if (!q) return 'Search by username or user ID. Username search needs at least 3 characters; use a full ID for shorter queries.';
    if (normalizeAdminUserSearchQuery(q).length < 3) return 'Enter the full user ID, or type at least 3 characters to search usernames.';
    return null;
  })();

  const showEmptyResults =
    adminUserSearchShouldRun(normalizeAdminUserSearchQuery(debouncedSearch)) &&
    !searchLoading &&
    searchResults.length === 0;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-border-custom bg-bg-primary/40 p-3 space-y-3">
        <h3 className="text-sm font-bold text-text-primary">Promote to moderator</h3>
        {promoteStep === 'pick' ? (
          <>
            <label className="block text-[11px] font-semibold text-text-muted">Search accounts</label>
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedUser(null);
              }}
              placeholder="Username or user ID…"
              aria-label="Search username or user ID"
              className="w-full rounded-lg border border-border-custom bg-bg-primary/40 px-3 py-2 text-sm"
            />
            {searchHint && <p className="text-[10px] text-text-muted">{searchHint}</p>}
            {promoteError && <p className="text-xs text-rose-400">{promoteError}</p>}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {searchLoading && (
                <p className="text-xs text-text-muted py-4 text-center">Searching…</p>
              )}
              {showEmptyResults && (
                <p className="text-xs text-text-muted py-4 text-center">
                  No regular user accounts match. Only users with role &ldquo;user&rdquo; can be promoted.
                </p>
              )}
              {!searchLoading &&
                searchResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs cursor-pointer ${selectedUser?.id === u.id ? 'bg-indigo-600/20 border border-indigo-500/40' : 'border border-border-custom'}`}
                  >
                    @{u.username} <span className="text-text-muted">#{u.id}</span>
                  </button>
                ))}
            </div>
            {selectedUser && (
              <p className="text-xs text-text-secondary">
                Selected: <strong>@{selectedUser.username}</strong>{' '}
                <button
                  type="button"
                  className="text-indigo-400 cursor-pointer ml-1"
                  onClick={() => setSelectedUser(null)}
                >
                  Change
                </button>
              </p>
            )}
            <button
              type="button"
              disabled={!selectedUser}
              onClick={() => {
                setPromoteError(null);
                setPromoteStep('permissions');
              }}
              className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
            >
              Next: permissions
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-text-secondary mb-1">
              Permissions for <strong>@{selectedUser?.username}</strong>
            </p>
            {promoteError && <p className="text-xs text-rose-400 mb-2">{promoteError}</p>}
            <ModeratorPermissionsEditor
              initialKeys={[...DEFAULT_MODERATOR_PERMISSIONS]}
              onCancel={resetPromoteFlow}
              onSave={promote}
              saving={promoteBusy}
              saveLabel="Promote moderator"
            />
          </>
        )}
      </section>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading ? (
        <p className="text-xs text-text-muted py-4 text-center">Loading…</p>
      ) : moderators.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">No moderators yet.</p>
      ) : (
        <div className="space-y-2">
          {moderators.map((m) => (
            <div key={m.id} className="rounded-xl border border-border-custom bg-bg-primary/40 p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">@{m.username}</p>
                <p className="text-[10px] text-text-muted">
                  {m.permissionCount} permissions · {m.moderatorStatus ?? 'active'} · joined {new Date(m.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={busyId === m.id} onClick={() => void openEdit(m.id)} className="text-[11px] px-2 py-1 rounded border border-border-custom cursor-pointer">Edit permissions</button>
                {m.moderatorStatus === 'suspended' ? (
                  <button type="button" disabled={busyId === m.id} onClick={() => void setStatus(m.id, 'active')} className="text-[11px] px-2 py-1 rounded border border-emerald-500/40 text-emerald-400 cursor-pointer">Reactivate</button>
                ) : (
                  <button type="button" disabled={busyId === m.id} onClick={() => void setStatus(m.id, 'suspended')} className="text-[11px] px-2 py-1 rounded border border-amber-500/40 text-amber-400 cursor-pointer">Suspend</button>
                )}
                <button type="button" disabled={busyId === m.id} onClick={() => void removeRole(m.id)} className="text-[11px] px-2 py-1 rounded border border-rose-500/40 text-rose-400 cursor-pointer">Remove role</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-border-custom bg-bg-secondary p-4 my-8">
            <h4 className="text-sm font-bold mb-2">@{editing.username}</h4>
            <ModeratorPermissionsEditor
              initialKeys={editing.permissionKeys}
              onCancel={() => setEditing(null)}
              onSave={savePermissions}
              saving={busyId === editing.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
