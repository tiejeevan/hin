import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Globe,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  UserRound,
  VenetianMask,
} from 'lucide-react';
import { User as UserType, AccountStatus } from '@hin/types';
import { AdminData } from '../../types/ui';

interface RegisteredAccountsProps {
  adminData: AdminData;
  currentUser: UserType;
  onImpersonateUser: (userId: number) => void;
  onUpdateUserRole: (userId: number, currentRole: 'user' | 'admin') => void;
  onDeleteUser: (userId: number, username: string) => void;
  onReinstateUser: (userId: number, username: string) => void;
}

const PAGE_SIZE = 10;

type RoleFilter = 'all' | 'admin' | 'user';
type StatusFilter = 'all' | 'active' | 'self_deleted' | 'admin_deleted';
type PostsFilter = 'all' | 'none' | '1-9' | '10+';
type SortOption = 'newest' | 'oldest' | 'username' | 'most_posts' | 'fewest_posts';

function statusLabel(status: AccountStatus | undefined): string {
  switch (status) {
    case 'self_deleted':
      return 'Self-deleted';
    case 'admin_deleted':
      return 'Admin-deleted';
    default:
      return 'Active';
  }
}

function statusClass(status: AccountStatus | undefined): string {
  switch (status) {
    case 'self_deleted':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'admin_deleted':
      return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    default:
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  }
}

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-sky-500 to-cyan-500',
  'from-fuchsia-500 to-purple-500',
];

function avatarGradient(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatJoined(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Subsequence fuzzy match: every query char must appear in order in the target.
 * Returns a score (higher = better) or null if there's no match.
 * Consecutive matches and matches at the start score higher.
 */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;

  // Exact substring matches always win over scattered subsequences.
  const substringIdx = t.indexOf(q);
  if (substringIdx !== -1) return 1000 - substringIdx;

  let score = 0;
  let tIdx = 0;
  let prevMatchIdx = -2;
  for (let qIdx = 0; qIdx < q.length; qIdx++) {
    const found = t.indexOf(q[qIdx], tIdx);
    if (found === -1) return null;
    score += found === prevMatchIdx + 1 ? 5 : 1;
    prevMatchIdx = found;
    tIdx = found + 1;
  }
  return score;
}

function matchesSearch(query: string, user: UserType): number | null {
  const trimmed = query.trim().replace(/^[@#]/, '');
  if (!trimmed) return 0;
  const usernameScore = fuzzyScore(trimmed, user.username);
  const idScore = String(user.id) === trimmed ? 2000 : null;
  if (usernameScore === null && idScore === null) return null;
  return Math.max(usernameScore ?? -Infinity, idScore ?? -Infinity);
}

const selectClass =
  'w-full sm:w-auto bg-bg-primary/40 border border-border-custom rounded-lg px-2 py-2 text-xs text-text-secondary focus:outline-none focus:border-indigo-500/60 cursor-pointer';

const actionButtonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer px-3 py-2';

interface UserActionsProps {
  user: UserType;
  isSelf: boolean;
  isDeleted: boolean;
  fullWidth?: boolean;
  onImpersonateUser: (userId: number) => void;
  onUpdateUserRole: (userId: number, currentRole: 'user' | 'admin') => void;
  onDeleteUser: (userId: number, username: string) => void;
  onReinstateUser: (userId: number, username: string) => void;
}

function UserActions({
  user,
  isSelf,
  isDeleted,
  fullWidth = false,
  onImpersonateUser,
  onUpdateUserRole,
  onDeleteUser,
  onReinstateUser,
}: UserActionsProps) {
  const grow = fullWidth ? 'flex-1' : '';

  if (isDeleted) {
    return (
      <button
        onClick={() => onReinstateUser(user.id, user.username)}
        className={`${actionButtonBase} ${grow} bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm`}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reinstate
      </button>
    );
  }

  if (isSelf) {
    return <span className="text-[10px] text-text-muted italic px-2">This is you</span>;
  }

  return (
    <>
      <button
        onClick={() => onImpersonateUser(user.id)}
        title={`Act as @${user.username}`}
        className={`${actionButtonBase} ${grow} bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm`}
      >
        <VenetianMask className="h-3.5 w-3.5" />
        Act As
      </button>
      <button
        onClick={() => onUpdateUserRole(user.id, user.role)}
        title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
        className={`${actionButtonBase} ${grow} bg-bg-tertiary hover:bg-bg-primary text-text-secondary border border-border-custom`}
      >
        <Shield className="h-3.5 w-3.5" />
        {user.role === 'admin' ? 'Demote' : 'Promote'}
      </button>
      <button
        onClick={() => onDeleteUser(user.id, user.username)}
        title={`Delete @${user.username}`}
        className={`${actionButtonBase} ${grow} bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25`}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </>
  );
}

function UserIdentity({ user }: { user: UserType }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className={`h-9 w-9 shrink-0 rounded-full bg-gradient-to-br ${avatarGradient(user.username)} flex items-center justify-center text-white text-sm font-bold shadow-sm`}
        aria-hidden="true"
      >
        {user.username.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-text-primary text-sm truncate">@{user.username}</p>
        <p className="text-[10px] text-text-muted font-mono">#{user.id}</p>
      </div>
    </div>
  );
}

export function RegisteredAccounts({
  adminData,
  currentUser,
  onImpersonateUser,
  onUpdateUserRole,
  onDeleteUser,
  onReinstateUser,
}: RegisteredAccountsProps) {
  const [usersOpen, setUsersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [postsFilter, setPostsFilter] = useState<PostsFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [page, setPage] = useState(1);

  const countries = useMemo(() => {
    const set = new Set<string>();
    let hasUnknown = false;
    for (const u of adminData.users) {
      if (u.country) set.add(u.country);
      else hasUnknown = true;
    }
    return { list: Array.from(set).sort(), hasUnknown };
  }, [adminData.users]);

  const filteredUsers = useMemo(() => {
    const scored: { user: UserType; score: number }[] = [];

    for (const u of adminData.users) {
      if (roleFilter !== 'all' && u.role !== roleFilter) continue;

      const status: StatusFilter = u.accountStatus === 'self_deleted' || u.accountStatus === 'admin_deleted'
        ? u.accountStatus
        : 'active';
      if (statusFilter !== 'all' && status !== statusFilter) continue;

      if (countryFilter !== 'all') {
        if (countryFilter === '__unknown__' ? !!u.country : u.country !== countryFilter) continue;
      }

      const posts = u.postCount ?? 0;
      if (postsFilter === 'none' && posts !== 0) continue;
      if (postsFilter === '1-9' && (posts < 1 || posts > 9)) continue;
      if (postsFilter === '10+' && posts < 10) continue;

      const score = matchesSearch(search, u);
      if (score === null) continue;

      scored.push({ user: u, score });
    }

    const hasQuery = search.trim().length > 0;
    scored.sort((a, b) => {
      // With an active search, relevance comes first; the sort option breaks ties.
      if (hasQuery && a.score !== b.score) return b.score - a.score;
      switch (sortBy) {
        case 'oldest':
          return new Date(a.user.createdAt).getTime() - new Date(b.user.createdAt).getTime();
        case 'username':
          return a.user.username.localeCompare(b.user.username);
        case 'most_posts':
          return (b.user.postCount ?? 0) - (a.user.postCount ?? 0);
        case 'fewest_posts':
          return (a.user.postCount ?? 0) - (b.user.postCount ?? 0);
        default:
          return new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime();
      }
    });

    return scored.map(s => s.user);
  }, [adminData.users, search, roleFilter, statusFilter, countryFilter, postsFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageUsers = filteredUsers.slice(pageStart, pageStart + PAGE_SIZE);

  const hasActiveFilters =
    search.trim() !== '' ||
    roleFilter !== 'all' ||
    statusFilter !== 'all' ||
    countryFilter !== 'all' ||
    postsFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setCountryFilter('all');
    setPostsFilter('all');
    setPage(1);
  };

  const resetPage = () => setPage(1);

  const pageNumbers = useMemo(() => {
    const pages: (number | '…')[] = [];
    const add = (p: number) => {
      if (pages[pages.length - 1] !== p) pages.push(p);
    };
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
        add(p);
      } else if (pages[pages.length - 1] !== '…') {
        pages.push('…');
      }
    }
    return pages;
  }, [totalPages, currentPage]);

  return (
    <div className="space-y-4 p-3 md:p-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Active Users</p>
          <p className="text-xl font-bold text-text-primary mt-1">{adminData.stats.users}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Deleted Users</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{adminData.stats.deletedUsers ?? 0}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Total Posts</p>
          <p className="text-xl font-bold text-indigo-400 mt-1">{adminData.stats.posts}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left">
          <p className="text-[10px] text-text-muted font-semibold uppercase">Comments</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{adminData.stats.comments}</p>
        </div>
        <div className="bg-bg-primary/30 border border-border-custom p-3 rounded-xl text-left col-span-2 md:col-span-1">
          <p className="text-[10px] text-text-muted font-semibold uppercase">DMs Sent</p>
          <p className="text-xl font-bold text-violet-400 mt-1">{adminData.stats.messages}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setUsersOpen(prev => !prev)}
        aria-expanded={usersOpen}
        className="w-full flex items-center justify-between gap-2 bg-bg-primary/30 hover:bg-bg-tertiary/50 border border-border-custom rounded-xl px-3.5 py-3 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-left">
          <span className="h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 flex items-center justify-center shrink-0">
            <UserRound className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-text-primary">User list</span>
            <span className="block text-[10px] text-text-muted">
              {adminData.users.length} accounts · search, filter, and manage
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-text-muted shrink-0 transition-transform ${usersOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {usersOpen && (
        <>
          <div className="bg-bg-primary/20 border border-border-custom rounded-xl p-3 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="Search username or user ID…"
                className="w-full bg-bg-primary/40 border border-border-custom rounded-lg pl-9 pr-3 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-indigo-500/60"
                aria-label="Search accounts"
              />
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-2">
              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase text-text-muted">
                Role
                <select
                  value={roleFilter}
                  onChange={e => {
                    setRoleFilter(e.target.value as RoleFilter);
                    resetPage();
                  }}
                  className={selectClass}
                >
                  <option value="all">All</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase text-text-muted">
                Status
                <select
                  value={statusFilter}
                  onChange={e => {
                    setStatusFilter(e.target.value as StatusFilter);
                    resetPage();
                  }}
                  className={selectClass}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="self_deleted">Self-deleted</option>
                  <option value="admin_deleted">Admin-deleted</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase text-text-muted">
                Country
                <select
                  value={countryFilter}
                  onChange={e => {
                    setCountryFilter(e.target.value);
                    resetPage();
                  }}
                  className={selectClass}
                >
                  <option value="all">All</option>
                  {countries.list.map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                  {countries.hasUnknown && <option value="__unknown__">Not set</option>}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase text-text-muted">
                Posts
                <select
                  value={postsFilter}
                  onChange={e => {
                    setPostsFilter(e.target.value as PostsFilter);
                    resetPage();
                  }}
                  className={selectClass}
                >
                  <option value="all">Any</option>
                  <option value="none">No posts</option>
                  <option value="1-9">1–9 posts</option>
                  <option value="10+">10+ posts</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase text-text-muted">
                Sort
                <select
                  value={sortBy}
                  onChange={e => {
                    setSortBy(e.target.value as SortOption);
                    resetPage();
                  }}
                  className={selectClass}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="username">Username A–Z</option>
                  <option value="most_posts">Most posts</option>
                  <option value="fewest_posts">Fewest posts</option>
                </select>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center justify-center gap-1 px-2.5 py-2 text-[10px] font-semibold text-text-secondary bg-bg-tertiary hover:bg-bg-primary border border-border-custom rounded-lg transition-colors cursor-pointer"
                >
                  <FilterX className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}

              <span className="col-span-2 sm:col-span-1 sm:ml-auto pb-1 text-[11px] text-text-muted text-right" aria-live="polite">
                {filteredUsers.length === adminData.users.length
                  ? `${adminData.users.length} accounts`
                  : `${filteredUsers.length} of ${adminData.users.length} accounts`}
              </span>
            </div>
          </div>

          {pageUsers.length === 0 && (
            <div className="p-8 text-center text-xs text-text-muted border border-border-custom rounded-xl">
              No accounts match the current search and filters.
            </div>
          )}

          {/* Mobile: card list */}
          {pageUsers.length > 0 && (
            <div className="md:hidden space-y-2">
              {pageUsers.map(u => {
                const isDeleted = u.accountStatus === 'self_deleted' || u.accountStatus === 'admin_deleted';
                return (
                  <div
                    key={u.id}
                    className={`bg-bg-primary/30 border border-border-custom rounded-xl p-3 space-y-3 ${isDeleted ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <UserIdentity user={u} />
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass(u.accountStatus)}`}
                        >
                          {statusLabel(u.accountStatus)}
                        </span>
                        {u.role === 'admin' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-500 border border-amber-500/30">
                            admin
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {u.country || 'No country'}
                      </span>
                      <span className="font-mono">{u.postCount ?? 0} posts</span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        Joined {formatJoined(u.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <UserActions
                        user={u}
                        isSelf={u.id === currentUser.id}
                        isDeleted={isDeleted}
                        fullWidth
                        onImpersonateUser={onImpersonateUser}
                        onUpdateUserRole={onUpdateUserRole}
                        onDeleteUser={onDeleteUser}
                        onReinstateUser={onReinstateUser}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Desktop: table */}
          {pageUsers.length > 0 && (
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border-custom">
              <table className="w-full text-xs text-left text-text-secondary">
                <thead className="bg-bg-primary/30 text-text-muted border-b border-border-custom">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Country</th>
                    <th className="p-3 text-right">Posts</th>
                    <th className="p-3">Joined</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom">
                  {pageUsers.map(u => {
                    const isDeleted = u.accountStatus === 'self_deleted' || u.accountStatus === 'admin_deleted';
                    return (
                      <tr key={u.id} className={`hover:bg-bg-tertiary/40 ${isDeleted ? 'opacity-70' : ''}`}>
                        <td className="p-3">
                          <UserIdentity user={u} />
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              u.role === 'admin'
                                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                                : 'bg-bg-tertiary text-text-muted'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusClass(u.accountStatus)}`}
                          >
                            {statusLabel(u.accountStatus)}
                          </span>
                        </td>
                        <td className="p-3 text-text-muted">{u.country || '—'}</td>
                        <td className="p-3 text-right font-mono text-text-secondary">{u.postCount ?? 0}</td>
                        <td className="p-3 text-text-muted whitespace-nowrap">{formatJoined(u.createdAt)}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <UserActions
                              user={u}
                              isSelf={u.id === currentUser.id}
                              isDeleted={isDeleted}
                              onImpersonateUser={onImpersonateUser}
                              onUpdateUserRole={onUpdateUserRole}
                              onDeleteUser={onDeleteUser}
                              onReinstateUser={onReinstateUser}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredUsers.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-[11px] text-text-muted text-center sm:text-left">
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
              </span>
              <div className="flex items-center justify-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-border-custom text-text-secondary hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="px-1.5 text-text-muted text-xs">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === currentPage ? 'page' : undefined}
                      className={`h-9 min-w-9 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        p === currentPage
                          ? 'bg-indigo-600 text-white'
                          : 'border border-border-custom text-text-secondary hover:bg-bg-tertiary'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-border-custom text-text-secondary hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
