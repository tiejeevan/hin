import { useState, useRef, useEffect } from 'react';
import { Heart, MessageSquare, Shield, Trash2, Send, X, MoreVertical, Pencil, Link2, Bookmark, Repeat2, Flag, Pin } from 'lucide-react';
import { UserRoleBadge } from '../profile/UserRoleBadge';
import { Post, Comment, User as UserType, DEFAULT_SYSTEM_SETTINGS, isUnavailableRepostedPost } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { buildCommentTree } from '../../utils/comments';
import { CommentItem } from './CommentItem';
import { PostContentText } from './PostContentText';
import { LinkPreviewCard } from './LinkPreviewCard';
import { getOlabidItemIdFromUrl, postPermalinkUrl } from '../../lib/appRoutes';
import { ImageLightbox } from './ImageLightbox';
import { PostMediaGallery } from './PostMediaGallery';
import { PostPollBody } from './PostPollBody';
import { UserAvatar } from '../profile/UserAvatar';
import { EquippedBadgesInline } from '../gamification/EquippedBadgesInline';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import { ReshareSheet } from './ReshareSheet';
import { QuoteComposer } from './QuoteComposer';
import { usePermissions } from '../../lib/permissions';

/** Post id used for likes, comments, bookmarks, and reshare on this card. */
export function getPostEngagementId(post: Post): number {
  const isSilentRepost = !!post.repostOfPostId && !post.isQuote;
  const embedded = post.repostedPost;
  if (isSilentRepost && embedded && !isUnavailableRepostedPost(embedded)) {
    return embedded.id;
  }
  return post.id;
}

interface PostCardProps {
  post: Post;
  currentUser: UserType | null;
  commentsList: Comment[];
  isCommentsExpanded: boolean;
  isNewlyCreated: boolean;
  editingPostId: number | null;
  editingPostContent: string;
  newCommentText: string;
  replyingTo: Comment | null;
  editingCommentId: number | null;
  editingCommentContent: string;
  hideAuthorHeader?: boolean;
  showPinnedBadge?: boolean;
  readOnly?: boolean;
  gamificationEnabled?: boolean;
  highlightCommentId?: number | null;
  onSignInRequired?: () => void;
  onCopyPermalink?: () => void;
  onOpenPost?: (postId: number) => void;
  onOpenOlabidItem?: (itemId: number) => void;
  onToggleBookmark?: () => void;
  onRepost?: (postId: number) => void;
  onUndoRepost?: (postId: number) => void;
  onQuotePost?: (postId: number, content: string) => void | Promise<void>;
  onShareExternal?: (postId: number) => void;
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
  onViewProfile: (userIdOrUsername: number | string) => void;
  onViewHashtag?: (tag: string) => void;
  onVotePoll: (postId: number, optionIds: number[]) => Promise<void>;
  onRetractPollVote: (postId: number) => Promise<void>;
  onClosePoll: (postId: number) => Promise<void>;
  onReport?: (postId: number) => void;
  onReportComment?: (commentId: number) => void;
  onPinPost?: (postId: number) => void;
  onUnpinPost?: (postId: number) => void;
  onRetryPendingPost?: (postId: number) => void;
  onModerationHidePost?: (postId: number) => void;
  onModerationRemovePost?: (postId: number) => void;
  onModerationHideComment?: (commentId: number) => void;
  onModerationRemoveComment?: (commentId: number) => void;
  maxPostLength?: number;
}

export function PostCard({
  post,
  currentUser,
  commentsList,
  isCommentsExpanded,
  isNewlyCreated,
  editingPostId,
  editingPostContent,
  newCommentText,
  replyingTo,
  editingCommentId,
  editingCommentContent,
  hideAuthorHeader = false,
  showPinnedBadge = false,
  readOnly = false,
  gamificationEnabled = false,
  highlightCommentId = null,
  onSignInRequired,
  onCopyPermalink,
  onOpenPost,
  onOpenOlabidItem,
  onToggleBookmark,
  onRepost,
  onUndoRepost,
  onQuotePost,
  onShareExternal,
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
  onViewProfile,
  onViewHashtag,
  onVotePoll,
  onRetractPollVote,
  onClosePoll,
  onReport,
  onReportComment,
  onPinPost,
  onUnpinPost,
  onRetryPendingPost,
  onModerationHidePost,
  onModerationRemovePost,
  onModerationHideComment,
  onModerationRemoveComment,
  maxPostLength = DEFAULT_SYSTEM_SETTINGS.maxPostLength,
}: PostCardProps) {
  const { can } = usePermissions();
  const token = localStorage.getItem('hin_token');

  const isSilentRepost = !!post.repostOfPostId && !post.isQuote;
  const isQuotePost = !!post.repostOfPostId && !!post.isQuote;
  const embedded = post.repostedPost;
  const engPost: Post =
    isSilentRepost && embedded && !isUnavailableRepostedPost(embedded) ? embedded : post;
  const actionPostId = getPostEngagementId(post);
  const interactionPost = isSilentRepost ? engPost : post;
  const contentPost = isSilentRepost ? engPost : post;
  const headerPost = isSilentRepost ? engPost : post;

  const [reshareOpen, setReshareOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);

  const postAutocomplete = useMentionAutocomplete({
    value: editingPostContent,
    onChange: onEditPostContentChange,
    token,
  });

  const commentAutocomplete = useMentionAutocomplete({
    value: newCommentText,
    onChange: val => onCommentTextChange(actionPostId, val),
    token,
  });

  const nestedComments = buildCommentTree(commentsList);
  const COMMENTS_PAGE_SIZE = 5;
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCommentCount, setVisibleCommentCount] = useState(COMMENTS_PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canManagePost =
    !readOnly &&
    !post.isPending &&
    currentUser &&
    (currentUser.role === 'admin' || currentUser.id === post.userId);
  const canReportPost = !readOnly && !post.isPending && currentUser && currentUser.id !== post.userId && onReport;
  const canModHide =
    !readOnly &&
    !post.isPending &&
    currentUser &&
    currentUser.id !== headerPost.userId &&
    can('post.hide') &&
    !!onModerationHidePost;
  const canModRemove =
    !readOnly &&
    !post.isPending &&
    currentUser &&
    currentUser.id !== headerPost.userId &&
    can('post.remove') &&
    !!onModerationRemovePost;
  const isRootPost = !post.parentPostId;
  const canPinPost = canManagePost && isRootPost && onPinPost && onUnpinPost;
  const canReshare = !!onRepost && !post.isPending;
  const showPostMenu = canManagePost || canReportPost || canReshare || canModHide || canModRemove;

  const requireAuth = (action: () => void) => {
    if (readOnly || !currentUser) {
      onSignInRequired?.();
      return;
    }
    action();
  };

  const handleCopyLink = () => {
    if (onCopyPermalink) {
      onCopyPermalink();
      return;
    }
    navigator.clipboard.writeText(postPermalinkUrl(engPost.id));
  };

  useEffect(() => {
    if (!isCommentsExpanded) {
      setVisibleCommentCount(COMMENTS_PAGE_SIZE);
    }
  }, [isCommentsExpanded]);

  useEffect(() => {
    if (highlightCommentId && isCommentsExpanded) {
      setVisibleCommentCount(Number.MAX_SAFE_INTEGER);
    }
  }, [highlightCommentId, isCommentsExpanded]);

  useEffect(() => {
    if (!highlightCommentId || !isCommentsExpanded || commentsList.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`comment-${highlightCommentId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('ring-2', 'ring-indigo-500/50', 'rounded-xl');
      setTimeout(() => el?.classList.remove('ring-2', 'ring-indigo-500/50', 'rounded-xl'), 2000);
    }, 300);
    return () => clearTimeout(t);
  }, [highlightCommentId, isCommentsExpanded, commentsList.length]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const renderPostBody = () => {
    if (editingPostId === post.id) {
      return (
        <div className="space-y-2.5 mt-2 relative">
          <textarea
            ref={postAutocomplete.inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            value={editingPostContent}
            onChange={e => {
              onEditPostContentChange(e.target.value);
              postAutocomplete.handleInputChange(e);
            }}
            onKeyDown={postAutocomplete.handleKeyDown}
            maxLength={maxPostLength}
          />
          <div className="flex justify-end">
            <span className={`text-[10px] ${editingPostContent.length > maxPostLength ? 'text-rose-400' : 'text-text-muted'}`}>
              {editingPostContent.length}/{maxPostLength}
            </span>
          </div>
          {postAutocomplete.showDropdown && (
            <MentionSuggestions
              suggestions={postAutocomplete.suggestions}
              activeIndex={postAutocomplete.activeIndex}
              onSelect={postAutocomplete.selectSuggestion}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelPostEdit}
              className="px-3.5 py-1.5 rounded-xl text-xs text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={() => onSavePostEdit(post.id)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all shadow-md cursor-pointer min-h-[44px]"
            >
              Save Edit
            </button>
          </div>
        </div>
      );
    }

    const renderContentBlock = (target: Post, openOnClick: boolean) => {
      if (!target.content.trim()) return null;
      if (openOnClick && onOpenPost) {
        return (
          <button
            type="button"
            onClick={() => onOpenPost(target.id)}
            className="block w-full text-left cursor-pointer hover:opacity-90 transition-opacity"
          >
            <PostContentText
              content={target.content}
              onViewProfile={onViewProfile}
              onViewHashtag={onViewHashtag}
              className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left"
            />
          </button>
        );
      }
      return (
        <PostContentText
          content={target.content}
          onViewProfile={onViewProfile}
          onViewHashtag={onViewHashtag}
          className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left"
        />
      );
    };

    const renderMediaAndExtras = (target: Post) => (
      <>
        {target.linkPreview && (
          <div onClick={e => e.stopPropagation()}>
            <LinkPreviewCard
              preview={target.linkPreview}
              inAppOlabidLinks={!!onOpenOlabidItem}
              onClick={e => {
                const itemId = getOlabidItemIdFromUrl(target.linkPreview!.url);
                if (itemId !== null && onOpenOlabidItem) {
                  e.preventDefault();
                  onOpenOlabidItem(itemId);
                }
              }}
            />
          </div>
        )}
        {target.type === 'poll' && target.poll && (
          <div onClick={e => e.stopPropagation()}>
            <PostPollBody
              post={target}
              poll={target.poll}
              isAuthor={!!currentUser && currentUser.id === target.userId}
              onVote={readOnly ? async () => { onSignInRequired?.(); } : onVotePoll}
              onRetractVote={readOnly ? async () => { onSignInRequired?.(); } : onRetractPollVote}
              onClosePoll={readOnly ? async () => {} : onClosePoll}
            />
          </div>
        )}
        {target.mediaUrls && target.mediaUrls.length > 0 && (
          <div onClick={e => e.stopPropagation()}>
            <PostMediaGallery
              urls={target.mediaUrls}
              onImageClick={index => setLightboxIndex(index)}
            />
            {lightboxIndex !== null && (
              <ImageLightbox
                images={target.mediaUrls}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}
          </div>
        )}
      </>
    );

    if (isQuotePost) {
      return (
        <>
          {renderContentBlock(post, !!onOpenPost)}
          {embedded && (
            <div className="rounded-xl border border-border-custom bg-bg-primary/40 p-3 space-y-2">
              {isUnavailableRepostedPost(embedded) ? (
                <p className="text-xs text-text-muted">Original post unavailable</p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onViewProfile(embedded.username)}
                    className="text-xs font-semibold text-text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    @{embedded.username}
                    <UserRoleBadge
                      role={embedded.authorRole}
                      moderatorStatus={embedded.authorModeratorStatus}
                      size="sm"
                    />
                  </button>
                  <PostContentText
                    content={embedded.content}
                    onViewProfile={onViewProfile}
                    onViewHashtag={onViewHashtag}
                    className="text-xs text-text-secondary line-clamp-3"
                  />
                  {onOpenPost && (
                    <button
                      type="button"
                      onClick={() => onOpenPost(embedded.id)}
                      className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      View
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      );
    }

    return (
      <>
        {renderContentBlock(contentPost, !!onOpenPost && !isSilentRepost)}
        {renderMediaAndExtras(contentPost)}
      </>
    );
  };

  return (
    <article
      className={`bg-bg-secondary border border-border-custom rounded-2xl p-4 space-y-4 shadow-sm hover:border-border-custom transition-all relative ${
        isNewlyCreated ? 'animate-blink-border' : ''
      } ${post.isPending ? 'opacity-75' : ''} ${post.isError ? 'border-rose-500/40' : ''}`}
    >
      {(post.isPending || post.isError) && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          {post.isPending && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
              Sending…
            </span>
          )}
          {post.isError && (
            <button
              type="button"
              onClick={() => onRetryPendingPost?.(post.id)}
              className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {showPostMenu && (
        <div ref={menuRef} className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Post options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden"
            >
              {canReshare && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    requireAuth(() => setReshareOpen(true));
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors cursor-pointer min-h-[44px] ${
                    engPost.hasReposted
                      ? 'text-emerald-500 hover:bg-emerald-500/10'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-emerald-400'
                  }`}
                >
                  <Repeat2 className="h-3.5 w-3.5" />
                  Reshare
                  {(engPost.repostsCount ?? 0) > 0 && (
                    <span className="ml-auto text-[10px] text-text-muted">{engPost.repostsCount}</span>
                  )}
                </button>
              )}
              {canManagePost && (
                <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onStartPostEdit(post.id, post.content);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-indigo-400 transition-colors cursor-pointer min-h-[44px]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  {canPinPost && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        if (post.pinnedAt) onUnpinPost!(post.id);
                        else onPinPost!(post.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-indigo-400 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <Pin className="h-3.5 w-3.5" />
                      {post.pinnedAt ? 'Unpin' : 'Pin to profile'}
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePost(post.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer min-h-[44px]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </>
              )}
              {canModHide && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onModerationHidePost!(headerPost.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Shield className="h-3.5 w-3.5" />
                  Hide post
                </button>
              )}
              {canModRemove && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onModerationRemovePost!(headerPost.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove post
                </button>
              )}
              {canReportPost && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onReport!(post.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Flag className="h-3.5 w-3.5" />
                  Report
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isSilentRepost && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <Repeat2 className="h-3 w-3 shrink-0" />
          <button
            type="button"
            onClick={() => onViewProfile(post.username)}
            className="hover:text-indigo-400 transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            @{post.username}
            <UserRoleBadge
              role={post.authorRole}
              moderatorStatus={post.authorModeratorStatus}
              size="sm"
            />
            <span>reposted</span>
          </button>
        </div>
      )}

      {!hideAuthorHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {showPinnedBadge && post.pinnedAt && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-400 uppercase tracking-wide">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
            <UserAvatar
              username={headerPost.username}
              avatarUrl={headerPost.authorAvatarUrl}
              size="sm"
              onClick={() => onViewProfile(headerPost.username)}
            />
            <div className="text-left">
              <button
                type="button"
                onClick={() => onViewProfile(headerPost.username)}
                className="text-xs font-bold text-text-primary flex items-center gap-1 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                {headerPost.username}
                {gamificationEnabled && headerPost.authorEquippedBadges && headerPost.authorEquippedBadges.length > 0 && (
                  <EquippedBadgesInline badges={headerPost.authorEquippedBadges} size="sm" />
                )}
                <UserRoleBadge
                  role={headerPost.authorRole}
                  moderatorStatus={headerPost.authorModeratorStatus}
                  size="sm"
                />
              </button>
              <span className="text-[9px] text-text-muted flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onOpenPost
                      ? onOpenPost(isSilentRepost ? headerPost.id : post.id)
                      : onCopyPermalink?.()
                  }
                  className="hover:text-indigo-400 transition-colors cursor-pointer"
                  title={onOpenPost ? 'View post' : onCopyPermalink ? 'Copy link' : undefined}
                >
                  {new Date(headerPost.createdAt).toLocaleDateString()}{' '}
                  {new Date(headerPost.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
                {onCopyPermalink && !onOpenPost && (
                  <button
                    type="button"
                    onClick={onCopyPermalink}
                    className="p-0.5 hover:text-indigo-400 transition-colors cursor-pointer"
                    title="Copy link to post"
                    aria-label="Copy link to post"
                  >
                    <Link2 className="h-3 w-3" />
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">{renderPostBody()}</div>

      {showPinnedBadge && hideAuthorHeader && post.pinnedAt && (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-400 uppercase tracking-wide">
          <Pin className="h-3 w-3" />
          Pinned
        </span>
      )}

      <div className="flex items-center gap-6">
        <button
          onClick={() => requireAuth(() => onToggleLike(actionPostId))}
          className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer min-h-[44px] ${
            interactionPost.hasLiked ? 'text-rose-500 font-semibold' : 'text-text-muted hover:text-rose-400'
          }`}
        >
          <Heart className={`h-4.5 w-4.5 ${interactionPost.hasLiked ? 'fill-rose-500' : ''}`} />
          <span>{interactionPost.likesCount}</span>
        </button>

        <button
          onClick={() => onToggleComments(actionPostId)}
          className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer min-h-[44px] ${
            isCommentsExpanded ? 'text-indigo-400 font-semibold' : 'text-text-muted hover:text-indigo-400'
          }`}
        >
          <MessageSquare className="h-4.5 w-4.5" />
          <span>{interactionPost.commentsCount}</span>
        </button>

        {onToggleBookmark && (
          <button
            type="button"
            onClick={() => requireAuth(onToggleBookmark)}
            className={`ml-auto flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer min-h-[44px] px-1 ${
              interactionPost.hasBookmarked ? 'text-amber-500 font-semibold' : 'text-text-muted hover:text-amber-400'
            }`}
            title={interactionPost.hasBookmarked ? 'Remove bookmark' : 'Bookmark'}
            aria-label={interactionPost.hasBookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <Bookmark className={`h-4.5 w-4.5 ${interactionPost.hasBookmarked ? 'fill-amber-500' : ''}`} />
          </button>
        )}
      </div>

      {isCommentsExpanded && (
        <div className="border-t border-border-custom pt-4 mt-3 space-y-4">
          {replyingTo && !readOnly && (
            <div className="flex items-center justify-between bg-indigo-950/20 border border-indigo-900/30 rounded-xl px-3 py-1.5 text-[11px] text-indigo-300">
              <span>
                Replying to <strong>{replyingTo.username}</strong>
              </span>
              <button
                onClick={() => onCancelReply(actionPostId)}
                className="text-text-muted hover:text-text-primary p-0.5 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {!readOnly && (
          <form onSubmit={e => onCreateComment(actionPostId, e)} className="flex items-center gap-2">
            <div className="relative flex-grow">
              <input
                ref={commentAutocomplete.inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                required
                placeholder={replyingTo ? 'Write a reply...' : 'Write a comment...'}
                value={newCommentText}
                onChange={e => {
                  onCommentTextChange(actionPostId, e.target.value);
                  commentAutocomplete.handleInputChange(e);
                }}
                onKeyDown={commentAutocomplete.handleKeyDown}
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
              />
              {commentAutocomplete.showDropdown && (
                <MentionSuggestions
                  suggestions={commentAutocomplete.suggestions}
                  activeIndex={commentAutocomplete.activeIndex}
                  onSelect={commentAutocomplete.selectSuggestion}
                />
              )}
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-colors shrink-0 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
          )}

          {readOnly && (
            <p className="text-[11px] text-text-muted text-center">
              <button type="button" onClick={onSignInRequired} className="text-indigo-400 hover:underline cursor-pointer">
                Sign in
              </button>{' '}
              to comment
            </p>
          )}

          <div className="space-y-3.5">
            {nestedComments.length === 0 ? (
              <p className="text-[11px] text-text-muted text-center py-2">No comments yet.</p>
            ) : (
              <>
                {nestedComments.slice(0, visibleCommentCount).map(comment => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    depth={0}
                    postId={actionPostId}
                    currentUser={currentUser}
                  readOnly={readOnly}
                  gamificationEnabled={gamificationEnabled}
                  editingCommentId={editingCommentId}
                    editingCommentContent={editingCommentContent}
                    onDeleteComment={onDeleteComment}
                    onStartEdit={onStartCommentEdit}
                    onCancelEdit={onCancelCommentEdit}
                    onSaveEdit={onSaveCommentEdit}
                    onEditContentChange={onEditCommentContentChange}
                    onReply={onReply}
                    onToggleCommentLike={onToggleCommentLike}
                    onViewProfile={onViewProfile}
                    onViewHashtag={onViewHashtag}
                    onSignInRequired={onSignInRequired}
                    onReport={onReportComment}
                    onModerationHideComment={onModerationHideComment}
                    onModerationRemoveComment={onModerationRemoveComment}
                  />
                ))}
                {nestedComments.length > visibleCommentCount && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setVisibleCommentCount(count => count + COMMENTS_PAGE_SIZE)}
                      className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer py-1"
                    >
                      Show more ({nestedComments.length - visibleCommentCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {onRepost && (
        <ReshareSheet
          post={engPost}
          open={reshareOpen}
          onClose={() => setReshareOpen(false)}
          onRepost={() => onRepost(engPost.id)}
          onUndoRepost={() => onUndoRepost?.(engPost.id)}
          onQuote={() => setQuoteOpen(true)}
          onCopyLink={handleCopyLink}
          onShareExternal={() => onShareExternal?.(engPost.id)}
          requireAuth={requireAuth}
        />
      )}

      {onQuotePost && (
        <QuoteComposer
          original={engPost}
          open={quoteOpen}
          maxLength={maxPostLength}
          submitting={quoteSubmitting}
          onClose={() => setQuoteOpen(false)}
          onSubmit={async content => {
            setQuoteSubmitting(true);
            try {
              await onQuotePost(engPost.id, content);
              setQuoteOpen(false);
            } finally {
              setQuoteSubmitting(false);
            }
          }}
          onViewProfile={onViewProfile}
        />
      )}
    </article>
  );
}
