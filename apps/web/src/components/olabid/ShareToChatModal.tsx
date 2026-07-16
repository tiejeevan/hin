import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, X } from 'lucide-react';
import { ChatThread, User as UserType } from '@hin/types';
import { ChatRecipient } from '../../types/ui';
import { API_URL } from '../../config';
import { SILENT_LOADING_HEADER, SILENT_LOADING_VALUE } from '../../lib/globalLoading';
import { UserAvatar } from '../profile/UserAvatar';

interface ShareToChatModalProps {
  itemId: number;
  itemName: string;
  threads: ChatThread[];
  token: string | null;
  onClose: () => void;
  onSelect: (recipient: ChatRecipient, prefillText: string) => void;
  permalinkUrl: string;
}

export function ShareToChatModal({
  itemName,
  threads,
  token,
  onClose,
  onSelect,
  permalinkUrl,
}: ShareToChatModalProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserType[]>([]);
  const [searching, setSearching] = useState(false);

  const sortedThreads = useMemo(() => {
    return [...threads].sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [threads]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!token || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(query.trim())}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            [SILENT_LOADING_HEADER]: SILENT_LOADING_VALUE,
          },
        });
        if (res.ok) {
          setSearchResults(await res.json());
        }
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, token]);

  const pick = (user: { id: number; username: string; role: string; avatarUrl?: string | null }) => {
    onSelect(
      { id: user.id, username: user.username, role: user.role, avatarUrl: user.avatarUrl },
      permalinkUrl,
    );
  };

  const showingSearch = query.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 animate-backdrop-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Share item to chat"
        className="relative w-full sm:max-w-md bg-bg-secondary border border-border-custom rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-panel-pop-anchor"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-custom">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">Share to chat</h2>
            <p className="text-[11px] text-text-muted truncate">{itemName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border-custom">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search people..."
              className="w-full bg-bg-primary border border-border-custom rounded-xl pl-9 pr-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 min-h-[40px]"
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-border-custom/50">
          {showingSearch ? (
            searching ? (
              <p className="px-4 py-8 text-center text-[11px] text-text-muted">Searching...</p>
            ) : searchResults.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] text-text-muted">No users found</p>
            ) : (
              searchResults.map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => pick(user)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[52px]"
                >
                  <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sm" className="h-8 w-8 text-xs" />
                  <span className="text-sm font-medium text-text-primary">@{user.username}</span>
                </button>
              ))
            )
          ) : sortedThreads.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11px] text-text-muted flex flex-col items-center gap-2">
              <MessageCircle className="h-5 w-5 opacity-40" />
              <span>No recent chats. Search for someone above.</span>
            </div>
          ) : (
            sortedThreads.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-bg-tertiary transition-colors cursor-pointer min-h-[52px]"
              >
                <UserAvatar username={t.username} avatarUrl={t.avatarUrl} size="sm" className="h-8 w-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">@{t.username}</p>
                  {t.lastMessage && (
                    <p className="text-[11px] text-text-muted truncate">{t.lastMessage.content}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
