import { useCallback, useEffect, useState } from 'react';
import { BlockListUser, MuteListUser } from '@hin/types';
import { API_URL } from '../../config';
import { UserAvatar } from './UserAvatar';

interface BlockedMutedListProps {
  token: string;
  type: 'blocked' | 'muted';
  onUnblock?: (userId: number) => void | Promise<void>;
  onUnmute?: (userId: number) => void | Promise<void>;
  onViewProfile: (userId: number) => void;
}

export function BlockedMutedList({
  token,
  type,
  onUnblock,
  onUnmute,
  onViewProfile,
}: BlockedMutedListProps) {
  const [users, setUsers] = useState<(BlockListUser | MuteListUser)[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = type === 'blocked' ? '/api/blocks' : '/api/mutes';
      const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load list');
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load list');
    } finally {
      setLoading(false);
    }
  }, [token, type]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleAction = async (userId: number) => {
    setBusyId(userId);
    try {
      if (type === 'blocked' && onUnblock) await onUnblock(userId);
      if (type === 'muted' && onUnmute) await onUnmute(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-text-muted py-4 text-center">Loading...</p>;
  }

  if (error) {
    return <p className="text-xs text-rose-400 py-2">{error}</p>;
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-text-muted py-6 text-center border border-dashed border-border-custom rounded-xl">
        {type === 'blocked' ? 'No blocked accounts.' : 'No muted accounts.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {users.map(user => (
        <li
          key={user.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-border-custom bg-bg-primary/50"
        >
          <button
            type="button"
            onClick={() => onViewProfile(user.id)}
            className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
          >
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sm" />
            <span className="text-sm font-medium text-text-primary truncate">{user.username}</span>
          </button>
          <button
            type="button"
            disabled={busyId === user.id}
            onClick={() => void handleAction(user.id)}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border-custom bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary transition-colors cursor-pointer min-h-[36px] disabled:opacity-50"
          >
            {type === 'blocked' ? 'Unblock' : 'Unmute'}
          </button>
        </li>
      ))}
    </ul>
  );
}
