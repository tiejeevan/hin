import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, ChevronRight, Hash, MessageSquare, Users, BookOpen, Loader2 } from 'lucide-react';
import { Post, User, SearchResults, Comment } from '@hin/types';
import { API_URL } from '../../config';
import { UserAvatar } from '../profile/UserAvatar';
import { PostCard } from './PostCard';
import { CommentNode } from '../../types/ui';

interface SearchOverlayProps {
  token: string;
  currentUser: User | null;
  onClose: () => void;
  onOpenPost: (postId: number) => void;
  onOpenOlabidItem?: (itemId: number) => void;
  onViewProfile: (userIdOrUsername: number | string) => void;
  onViewHashtag: (tag: string) => void;

  // PostCard props mapping
  commentsList: Record<number, Comment[]>;
  expandedComments: Record<number, boolean>;
  editingPostId: number | null;
  editingPostContent: string;
  newCommentText: Record<number, string>;
  replyingTo: Record<number, Comment | null>;
  editingCommentId: number | null;
  editingCommentContent: string;
  gamificationEnabled?: boolean;
  highlightCommentId?: number | null;
  onToggleLike: (postId: number) => void;
  onToggleComments: (postId: number) => void;
  onDeletePost: (postId: number) => void;
  onStartPostEdit: (postId: number, content: string) => void;
  onCancelPostEdit: () => void;
  onSavePostEdit: (postId: number) => void;
  onEditPostContentChange: (content: string) => void;
  onCreateComment: (postId: number, e: React.FormEvent) => void;
  onCommentTextChange: (postId: number, text: string) => void;
  onCancelReply: (postId: number) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
  onStartCommentEdit: (commentId: number, content: string) => void;
  onCancelCommentEdit: () => void;
  onSaveCommentEdit: (postId: number, commentId: number) => void;
  onEditCommentContentChange: (content: string) => void;
  onReply: (postId: number, comment: CommentNode) => void;
  onToggleCommentLike: (postId: number, commentId: number) => void;
  onVotePoll: (postId: number, optionIds: number[]) => Promise<void>;
  onRetractPollVote: (postId: number) => Promise<void>;
  onClosePoll: (postId: number) => Promise<void>;
  onCopyPermalink?: (postId: number) => void;
  onToggleBookmark?: (postId: number) => void;
  onShare?: (postId: number) => void;
  onReportPost?: (postId: number) => void;
  onReportComment?: (commentId: number) => void;
  onPinPost?: (postId: number) => void;
  onUnpinPost?: (postId: number) => void;
  onStartThreadReply?: (postId: number) => void;
  onCancelThreadReply?: () => void;
  onSubmitThreadReply?: (postId: number) => void;
  threadReplyTargetId?: number | null;
  threadReplyContent?: string;
  onThreadReplyContentChange?: (content: string) => void;
  threadPosts?: Post[];
  maxPostLength?: number;
}

type SearchType = 'all' | 'posts' | 'users' | 'hashtags' | 'mentions';

const getIntentSearchType = (searchQuery: string): SearchType | null => {
  const trimmed = searchQuery.trimStart();
  if (trimmed.startsWith('@')) return 'mentions';
  if (trimmed.startsWith('#')) return 'hashtags';
  return null;
};

export function SearchOverlay({
  token,
  currentUser,
  onClose,
  onOpenPost,
  onOpenOlabidItem,
  onViewProfile,
  onViewHashtag,
  commentsList,
  expandedComments,
  editingPostId,
  editingPostContent,
  newCommentText,
  replyingTo,
  editingCommentId,
  editingCommentContent,
  gamificationEnabled,
  highlightCommentId,
  onToggleLike,
  onToggleComments,
  onDeletePost,
  onStartPostEdit,
  onCancelPostEdit,
  onSavePostEdit,
  onEditPostContentChange,
  onCreateComment,
  onCommentTextChange,
  onCancelReply,
  onDeleteComment,
  onStartCommentEdit,
  onCancelCommentEdit,
  onSaveCommentEdit,
  onEditCommentContentChange,
  onReply,
  onToggleCommentLike,
  onVotePoll,
  onRetractPollVote,
  onClosePoll,
  onCopyPermalink,
  onToggleBookmark,
  onShare,
  onReportPost,
  onReportComment,
  onPinPost,
  onUnpinPost,
  onStartThreadReply,
  onCancelThreadReply,
  onSubmitThreadReply,
  threadReplyTargetId,
  threadReplyContent,
  onThreadReplyContentChange,
  threadPosts,
  maxPostLength,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchType>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    users: [],
    posts: [],
    hashtags: [],
    mentions: [],
    hasMore: false,
  });
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Performs API search call
  const performSearch = useCallback(
    async (searchQuery: string, searchType: SearchType, currentOffset: number, append = false) => {
      if (searchQuery.trim().length < 2) {
        setResults({ users: [], posts: [], hashtags: [], mentions: [], hasMore: false });
        return;
      }

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          q: searchQuery,
          type: searchType,
          offset: String(currentOffset),
          limit: '15',
        });

        const res = await fetch(`${API_URL}/api/search?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data: SearchResults = await res.json();
          setResults(prev => {
            if (!append) return data;
            return {
              users: [...prev.users, ...data.users],
              posts: [...prev.posts, ...data.posts],
              hashtags: [...prev.hashtags, ...data.hashtags],
              mentions: [...prev.mentions, ...data.mentions],
              hasMore: data.hasMore,
            };
          });
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token],
  );

  // Debounced/Triggered search when input or tab changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setOffset(0);
      performSearch(query, activeTab, 0, false);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, activeTab, performSearch]);

  // Intent-aware tab selection from query prefixes
  useEffect(() => {
    const intentTab = getIntentSearchType(query);
    if (intentTab && intentTab !== activeTab) {
      setActiveTab(intentTab);
    }
  }, [query, activeTab]);

  const handleLoadMore = () => {
    if (loading || loadingMore || !results.hasMore) return;
    const nextOffset = offset + 15;
    setOffset(nextOffset);
    performSearch(query, activeTab, nextOffset, true);
  };

  const handleClear = () => {
    setQuery('');
    setResults({ users: [], posts: [], hashtags: [], mentions: [], hasMore: false });
    inputRef.current?.focus();
  };

  const renderPostCard = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      currentUser={currentUser}
      onViewProfile={onViewProfile}
      onViewHashtag={onViewHashtag}
      commentsList={commentsList[post.id] ?? []}
      isCommentsExpanded={!!expandedComments[post.id]}
      isNewlyCreated={false}
      newCommentText={newCommentText[post.id] ?? ''}
      replyingTo={replyingTo[post.id] ?? null}
      editingPostId={editingPostId}
      editingPostContent={editingPostContent}
      editingCommentId={editingCommentId}
      editingCommentContent={editingCommentContent}
      gamificationEnabled={gamificationEnabled}
      highlightCommentId={highlightCommentId}
      onToggleLike={onToggleLike}
      onToggleComments={onToggleComments}
      onDeletePost={onDeletePost}
      onStartPostEdit={onStartPostEdit}
      onCancelPostEdit={onCancelPostEdit}
      onSavePostEdit={onSavePostEdit}
      onEditPostContentChange={onEditPostContentChange}
      onCreateComment={onCreateComment}
      onCommentTextChange={onCommentTextChange}
      onCancelReply={onCancelReply}
      onDeleteComment={onDeleteComment}
      onStartCommentEdit={onStartCommentEdit}
      onCancelCommentEdit={onCancelCommentEdit}
      onSaveCommentEdit={onSaveCommentEdit}
      onEditCommentContentChange={onEditCommentContentChange}
      onReply={onReply}
      onToggleCommentLike={onToggleCommentLike}
      onVotePoll={onVotePoll}
      onRetractPollVote={onRetractPollVote}
      onClosePoll={onClosePoll}
      onCopyPermalink={onCopyPermalink ? () => onCopyPermalink(post.id) : undefined}
      onOpenPost={onOpenPost}
      onOpenOlabidItem={onOpenOlabidItem}
      onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(post.id) : undefined}
      onShare={onShare ? () => onShare(post.id) : undefined}
      onReport={onReportPost}
      onReportComment={onReportComment}
      onPinPost={onPinPost}
      onUnpinPost={onUnpinPost}
      onStartThreadReply={onStartThreadReply}
      onCancelThreadReply={onCancelThreadReply}
      onSubmitThreadReply={onSubmitThreadReply}
      threadReplyTargetId={threadReplyTargetId}
      threadReplyContent={threadReplyContent}
      onThreadReplyContentChange={onThreadReplyContentChange}
      threadPosts={threadPosts}
      maxPostLength={maxPostLength}
    />
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSectionEmptyAreaClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 bg-bg-primary/98 backdrop-blur-lg flex flex-col transition-all duration-300">
      {/* Search Header Area */}
      <div
        onClick={handleSectionEmptyAreaClick}
        className="border-b border-border-custom px-4 py-4 md:px-8 flex items-center gap-4 shrink-0 bg-bg-secondary/60"
      >
        <div className="relative flex-grow max-w-2xl mx-auto flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search users, posts, #hashtags, @mentions..."
            className="w-full pl-12 pr-10 py-3 rounded-2xl border border-border-custom bg-bg-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner text-sm md:text-base"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 p-1 rounded-full hover:bg-bg-tertiary text-text-muted cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-custom text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all cursor-pointer shrink-0"
          aria-label="Dismiss search"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs list */}
      <div
        onClick={handleSectionEmptyAreaClick}
        className="px-4 py-2.5 border-b border-border-custom overflow-x-auto scrollbar-none flex items-center gap-2 shrink-0 bg-bg-secondary/30"
      >
        <div onClick={handleSectionEmptyAreaClick} className="max-w-2xl mx-auto w-full flex items-center gap-1.5 py-1">
          {([
            { id: 'all', label: 'All', icon: BookOpen },
            { id: 'posts', label: 'Posts', icon: MessageSquare },
            { id: 'users', label: 'People', icon: Users },
            { id: 'hashtags', label: 'Hashtags', icon: Hash },
            { id: 'mentions', label: 'Mentions', icon: Search },
          ] as const).map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap min-h-[38px] ${
                  active
                    ? 'text-indigo-400 bg-indigo-500/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Content Results Area */}
      <div onClick={handleBackdropClick} className="flex-grow overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-2xl mx-auto w-full space-y-8 pb-12">
          {loading && offset === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <span className="text-sm text-text-muted">Searching the database…</span>
            </div>
          ) : query.trim().length < 2 ? (
            <div className="text-center py-20 text-text-muted space-y-2">
              <Search className="h-12 w-12 mx-auto text-text-muted/40 stroke-[1.5]" />
              <p className="font-medium text-base text-text-secondary">Search Hin</p>
              <p className="text-xs max-w-sm mx-auto">
                Type at least 2 characters to search for users, posts, hashtags, and mentions.
              </p>
            </div>
          ) : (
            <>
              {/* === ALL RESULTS TAB === */}
              {activeTab === 'all' && (
                <div className="space-y-8">
                  {/* Users Section */}
                  {results.users.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                          <Users className="h-3.5 w-3.5" /> People
                        </h3>
                        <button
                          type="button"
                          onClick={() => setActiveTab('users')}
                          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                        >
                          View all <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="bg-bg-secondary border border-border-custom rounded-2xl overflow-hidden divide-y divide-border-custom/60">
                        {results.users.slice(0, 4).map(user => (
                          <div
                            key={user.id}
                            onClick={() => {
                              onViewProfile(user.username);
                            }}
                            className="flex items-center gap-3 p-4 hover:bg-bg-tertiary/40 cursor-pointer transition-colors"
                          >
                            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="md" />
                            <div className="min-w-0 flex-grow">
                              <p className="text-sm font-semibold text-text-primary leading-tight">
                                {user.username}
                              </p>
                              {user.bio ? (
                                <p className="text-xs text-text-muted truncate mt-1">{user.bio}</p>
                              ) : (
                                <p className="text-xs text-text-muted/60 italic mt-1">No bio yet</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hashtags Section */}
                  {results.hashtags.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 px-1">
                        <Hash className="h-3.5 w-3.5" /> Hashtags
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {results.hashtags.map(tag => (
                          <button
                            key={tag.tag}
                            type="button"
                            onClick={() => {
                              onViewHashtag(tag.tag);
                            }}
                            className="px-4 py-2.5 rounded-2xl bg-bg-secondary border border-border-custom text-xs md:text-sm font-semibold text-text-secondary hover:text-indigo-400 hover:border-indigo-400/40 hover:bg-indigo-500/5 transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Hash className="h-3.5 w-3.5 text-text-muted" />
                            <span>{tag.tag}</span>
                            <span className="px-1.5 py-0.5 rounded-lg bg-bg-tertiary text-[10px] text-text-muted font-bold font-mono">
                              {tag.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mentions Section */}
                  {results.mentions.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                          <Search className="h-3.5 w-3.5" /> Mentions
                        </h3>
                        <button
                          type="button"
                          onClick={() => setActiveTab('mentions')}
                          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                        >
                          View all <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-4">
                        {results.mentions.slice(0, 3).map(post => renderPostCard(post))}
                      </div>
                    </div>
                  )}

                  {/* Posts Section */}
                  {results.posts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center px-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                          <MessageSquare className="h-3.5 w-3.5" /> Posts
                        </h3>
                        <button
                          type="button"
                          onClick={() => setActiveTab('posts')}
                          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                        >
                          View all <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-4">
                        {results.posts.slice(0, 3).map(post => renderPostCard(post))}
                      </div>
                    </div>
                  )}

                  {results.users.length === 0 &&
                    results.posts.length === 0 &&
                    results.hashtags.length === 0 &&
                    results.mentions.length === 0 && (
                      <div className="text-center py-20 text-text-muted">
                        No matches found for "{query}". Try different keywords.
                      </div>
                    )}
                </div>
              )}

              {/* === USERS TAB === */}
              {activeTab === 'users' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 px-1 mb-2">
                    <Users className="h-3.5 w-3.5" /> People matching "{query}"
                  </h3>
                  {results.users.length === 0 ? (
                    <p className="text-center py-12 text-text-muted">No matching users found.</p>
                  ) : (
                    <div className="bg-bg-secondary border border-border-custom rounded-2xl overflow-hidden divide-y divide-border-custom/60">
                      {results.users.map(user => (
                        <div
                          key={user.id}
                          onClick={() => {
                            onViewProfile(user.username);
                          }}
                          className="flex items-center gap-3 p-4 hover:bg-bg-tertiary/40 cursor-pointer transition-colors"
                        >
                          <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="md" />
                          <div className="min-w-0 flex-grow">
                            <p className="text-sm font-semibold text-text-primary leading-tight">
                              {user.username}
                            </p>
                            {user.bio ? (
                              <p className="text-xs text-text-muted truncate mt-1">{user.bio}</p>
                            ) : (
                              <p className="text-xs text-text-muted/60 italic mt-1">No bio yet</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* === HASHTAGS TAB === */}
              {activeTab === 'hashtags' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 px-1 mb-2">
                    <Hash className="h-3.5 w-3.5" /> Hashtags matching "{query}"
                  </h3>
                  {results.hashtags.length === 0 ? (
                    <p className="text-center py-12 text-text-muted">No matching hashtags found.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {results.hashtags.map(tag => (
                        <button
                          key={tag.tag}
                          type="button"
                          onClick={() => {
                            onViewHashtag(tag.tag);
                          }}
                          className="px-4 py-2.5 rounded-2xl bg-bg-secondary border border-border-custom text-xs md:text-sm font-semibold text-text-secondary hover:text-indigo-400 hover:border-indigo-400/40 hover:bg-indigo-500/5 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Hash className="h-3.5 w-3.5 text-text-muted" />
                          <span>{tag.tag}</span>
                          <span className="px-1.5 py-0.5 rounded-lg bg-bg-tertiary text-[10px] text-text-muted font-bold font-mono">
                            {tag.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* === MENTIONS TAB === */}
              {activeTab === 'mentions' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 px-1 mb-2">
                    <Search className="h-3.5 w-3.5" /> Posts mentioning @{query.replace(/^@/, '')}
                  </h3>
                  {results.mentions.length === 0 ? (
                    <p className="text-center py-12 text-text-muted">No mentions found.</p>
                  ) : (
                    results.mentions.map(post => renderPostCard(post))
                  )}
                </div>
              )}

              {/* === POSTS TAB === */}
              {activeTab === 'posts' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2 px-1 mb-2">
                    <MessageSquare className="h-3.5 w-3.5" /> Posts matching "{query}"
                  </h3>
                  {results.posts.length === 0 ? (
                    <p className="text-center py-12 text-text-muted">No matching posts found.</p>
                  ) : (
                    results.posts.map(post => renderPostCard(post))
                  )}
                </div>
              )}

              {/* Load More Button for paginated views */}
              {activeTab !== 'all' && results.hasMore && (
                <div className="pt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={handleLoadMore}
                    className="px-6 py-2.5 rounded-xl border border-border-custom bg-bg-secondary text-xs md:text-sm font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {loadingMore ? 'Loading…' : 'Load more results'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
