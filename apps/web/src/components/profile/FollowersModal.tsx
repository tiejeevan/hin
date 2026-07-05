import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { FollowListPage } from '@hin/types';
import { API_URL } from '../../config';
import { UserAvatar } from './UserAvatar';

interface FollowersModalProps {
  userId: number;
  mode: 'followers' | 'following';
  token: string;
  onClose: () => void;
  onViewProfile: (userId: number) => void;
}

export function FollowersModal({ userId, mode, token, onClose, onViewProfile }: FollowersModalProps) {
  const [users, setUsers] = useState<FollowListPage['users']>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = async (cursor?: number | null, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor != null) params.set('cursor', String(cursor));
      const endpoint = mode === 'followers' ? 'followers' : 'following';
      const res = await fetch(`${API_URL}/api/follows/${userId}/${endpoint}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: FollowListPage = await res.json();
        setUsers(prev => (append ? [...prev, ...data.users] : data.users));
        setNextCursor(data.nextCursor);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPage(null, false);
  }, [userId, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = mode === 'followers' ? 'Followers' : 'Following';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-md bg-bg-secondary border border-border-custom rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-custom">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-tertiary cursor-pointer">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-text-muted text-sm py-8">No users yet.</p>
          ) : (
            <ul className="space-y-1">
              {users.map(u => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onViewProfile(u.id);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-tertiary/60 text-left cursor-pointer"
                  >
                    <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size="sm" />
                    <span className="text-sm font-medium text-text-primary">{u.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor !== null && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => fetchPage(nextCursor, true)}
              className="w-full mt-2 py-2 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
