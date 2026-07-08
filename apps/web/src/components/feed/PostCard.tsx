import { useState, useRef, useEffect } from 'react';
import { Heart, MessageSquare, Shield, Trash2, Send, X, MoreVertical, Pencil, Link2, Bookmark, Share2, Flag, Pin, GitBranch } from 'lucide-react';
import { Post, Comment, User as UserType, DEFAULT_SYSTEM_SETTINGS } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { buildCommentTree } from '../../utils/comments';
import { CommentItem } from './CommentItem';
import { PostContentText } from './PostContentText';
import { LinkPreviewCard } from './LinkPreviewCard';
import { ImageLightbox } from './ImageLightbox';
import { PostMediaGallery } from './PostMediaGallery';
import { PostPollBody } from './PostPollBody';
import { UserAvatar } from '../profile/UserAvatar';
import { EquippedBadgesInline } from '../gamification/EquippedBadgesInline';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';
import { MentionSuggestions } from '../ui/MentionSuggestions';

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
  onToggleBookmark?: () => void;
  onShare?: () => void;
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
  onStartThreadReply?: (postId: number) => void;
  onCancelThreadReply?: () => void;
  onSubmitThreadReply?: (postId: number) => void;
  threadReplyTargetId?: number | null;
  threadReplyContent?: string;
  onThreadReplyContentChange?: (content: string) => void;
  threadPosts?: Post[];
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
  onToggleBookmark,
  onShare,
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
  onStartThreadReply,
  onCancelThreadReply,
  onSubmitThreadReply,
  threadReplyTargetId = null,
  threadReplyContent = '',
  onThreadReplyContentChange,
  threadPosts = [],
  maxPostLength = DEFAULT_SYSTEM_SETTINGS.maxPostLength,
}: PostCardProps) {
  const token = localStorage.getItem('hin_token');
  
  const postAutocomplete = useMentionAutocomplete({
    value: editingPostContent,
    onChange: onEditPostContentChange,
    token,
  });

  const commentAutocomplete = useMentionAutocomplete({
    value: newCommentText,
    onChange: (val) => onCommentTextChange(post.id, val),
    token,
  });

  const nestedComments = buildCommentTree(commentsList);
  const COMMENTS_PAGE_SIZE = 5;
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCommentCount, setVisibleCommentCount] = useState(COMMENTS_PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canManagePost = !readOnly && currentUser && (currentUser.role === 'admin' || currentUser.id === post.userId);
  const canReportPost = !readOnly && currentUser && currentUser.id !== post.userId && onReport;
  const isRootPost = !post.parentPostId;
  const canPinPost = canManagePost && isRootPost && onPinPost && onUnpinPost;
  const canThreadReply = canManagePost && isRootPost && onStartThreadReply;
  const showPostMenu = canManagePost || canReportPost;
  const isThreadReplyOpen = threadReplyTargetId === post.id;

  const requireAuth = (action: () => void) => {
    if (readOnly || !currentUser) {
      onSignInRequired?.();
      return;
    }
    action();
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

  return (
    <article
      className={`bg-bg-secondary border border-border-custom rounded-2xl p-4 space-y-4 shadow-sm hover:border-border-custom transition-all relative ${
        isNewlyCreated ? 'animate-blink-border' : ''
      }`}
    >
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
              className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden"
            >
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
                  {canThreadReply && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onStartThreadReply!(post.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-indigo-400 transition-colors cursor-pointer min-h-[44px]"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      Add to thread
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
              username={post.username}
              avatarUrl={post.authorAvatarUrl}
              size="sm"
              onClick={() => onViewProfile(post.username)}
            />
            <div className="text-left">
              <button
                type="button"
                onClick={() => onViewProfile(post.username)}
                className="text-xs font-bold text-text-primary flex items-center gap-1 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                {post.username}
                {gamificationEnabled && post.authorEquippedBadges && post.authorEquippedBadges.length > 0 && (
                  <EquippedBadgesInline badges={post.authorEquippedBadges} size="sm" />
                )}
                {post.authorRole === 'admin' && <Shield className="h-3 w-3 text-amber-500" />}
              </button>
              <span className="text-[9px] text-text-muted flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => (onOpenPost ? onOpenPost(post.id) : onCopyPermalink?.())}
                  className="hover:text-indigo-400 transition-colors cursor-pointer"
                  title={onOpenPost ? 'View post' : onCopyPermalink ? 'Copy link' : undefined}
                >
                  {new Date(post.createdAt).toLocaleDateString()}{' '}
                  {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

      <div className="space-y-3">
        {editingPostId === post.id ? (
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
        ) : (
          <>
            {post.content.trim() && (
              onOpenPost ? (
                <button
                  type="button"
                  onClick={() => onOpenPost(post.id)}
                  className="block w-full text-left cursor-pointer hover:opacity-90 transition-opacity"
                >
                  <PostContentText
                    content={post.content}
                    onViewProfile={onViewProfile}
                    onViewHashtag={onViewHashtag}
                    className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left"
                  />
                </button>
              ) : (
                <PostContentText
                  content={post.content}
                  onViewProfile={onViewProfile}
                  onViewHashtag={onViewHashtag}
                  className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left"
                />
              )
            )}
            {post.linkPreview && (
              <div onClick={e => e.stopPropagation()}>
                <LinkPreviewCard preview={post.linkPreview} />
              </div>
            )}
            {post.type === 'poll' && post.poll && (
              <div onClick={e => e.stopPropagation()}>
                <PostPollBody
                post={post}
                poll={post.poll}
                isAuthor={!!currentUser && currentUser.id === post.userId}
                onVote={readOnly ? async () => { onSignInRequired?.(); } : onVotePoll}
                onRetractVote={readOnly ? async () => { onSignInRequired?.(); } : onRetractPollVote}
                onClosePoll={readOnly ? async () => {} : onClosePoll}
              />
              </div>
            )}
          </>
        )}

        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <div onClick={e => e.stopPropagation()}>
            <PostMediaGallery
              urls={post.mediaUrls}
              onImageClick={index => setLightboxIndex(index)}
            />
            {lightboxIndex !== null && (
              <ImageLightbox
                images={post.mediaUrls}
                initialIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}
          </div>
        )}
      </div>

      {showPinnedBadge && hideAuthorHeader && post.pinnedAt && (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-400 uppercase tracking-wide">
          <Pin className="h-3 w-3" />
          Pinned
        </span>
      )}

      {threadPosts.length > 0 && (
        <div className="space-y-3 border-l-2 border-indigo-500/30 pl-4 ml-2">
          {threadPosts.map(reply => (
            <div key={reply.id} className="space-y-2">
              <p className="text-[10px] text-text-muted">
                {new Date(reply.createdAt).toLocaleString()}
              </p>
              <PostContentText
                content={reply.content}
                onViewProfile={onViewProfile}
                onViewHashtag={onViewHashtag}
                className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left"
              />
              {reply.mediaUrls.length > 0 && (
                <PostMediaGallery urls={reply.mediaUrls} onImageClick={() => {}} />
              )}
              {reply.linkPreview && <LinkPreviewCard preview={reply.linkPreview} />}
            </div>
          ))}
        </div>
      )}

      {isThreadReplyOpen && onSubmitThreadReply && onThreadReplyContentChange && (
        <form
          className="space-y-2 border border-border-custom rounded-xl p-3 bg-bg-primary/40"
          onSubmit={e => {
            e.preventDefault();
            onSubmitThreadReply(post.id);
          }}
        >
          <p className="text-xs text-text-muted">Add to your thread</p>
          <textarea
            rows={3}
            value={threadReplyContent}
            onChange={e => onThreadReplyContentChange(e.target.value)}
            maxLength={maxPostLength}
            className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            placeholder="Continue your thread…"
          />
          <div className="flex justify-end">
            <span className={`text-[10px] ${threadReplyContent.length > maxPostLength ? 'text-rose-400' : 'text-text-muted'}`}>
              {threadReplyContent.length}/{maxPostLength}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onCancelThreadReply?.()}
              className="text-xs text-text-muted hover:text-text-primary px-3 py-1.5 cursor-pointer min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!threadReplyContent.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all cursor-pointer min-h-[44px]"
            >
              Post reply
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-6">
        <button
          onClick={() => requireAuth(() => onToggleLike(post.id))}
          className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer min-h-[44px] ${
            post.hasLiked ? 'text-rose-500 font-semibold' : 'text-text-muted hover:text-rose-400'
          }`}
        >
          <Heart className={`h-4.5 w-4.5 ${post.hasLiked ? 'fill-rose-500' : ''}`} />
          <span>{post.likesCount}</span>
        </button>

        <button
          onClick={() => onToggleComments(post.id)}
          className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer min-h-[44px] ${
            isCommentsExpanded ? 'text-indigo-400 font-semibold' : 'text-text-muted hover:text-indigo-400'
          }`}
        >
          <MessageSquare className="h-4.5 w-4.5" />
          <span>{post.commentsCount}</span>
        </button>

        {(onToggleBookmark || onShare) && (
          <div className="ml-auto flex items-center gap-1">
            {onToggleBookmark && (
              <button
                type="button"
                onClick={() => requireAuth(onToggleBookmark)}
                className={`flex items-center gap-1.5 text-xs transition-colors py-1 cursor-pointer min-h-[44px] px-1 ${
                  post.hasBookmarked ? 'text-amber-500 font-semibold' : 'text-text-muted hover:text-amber-400'
                }`}
                title={post.hasBookmarked ? 'Remove bookmark' : 'Bookmark'}
                aria-label={post.hasBookmarked ? 'Remove bookmark' : 'Bookmark'}
              >
                <Bookmark className={`h-4.5 w-4.5 ${post.hasBookmarked ? 'fill-amber-500' : ''}`} />
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-indigo-400 transition-colors py-1 cursor-pointer min-h-[44px] px-1"
                title="Share"
                aria-label="Share post"
              >
                <Share2 className="h-4.5 w-4.5" />
                {(post.sharesCount ?? 0) > 0 && <span>{post.sharesCount}</span>}
              </button>
            )}
          </div>
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
                onClick={() => onCancelReply(post.id)}
                className="text-text-muted hover:text-text-primary p-0.5 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {!readOnly && (
          <form onSubmit={e => onCreateComment(post.id, e)} className="flex items-center gap-2">
            <div className="relative flex-grow">
              <input
                ref={commentAutocomplete.inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                required
                placeholder={replyingTo ? 'Write a reply...' : 'Write a comment...'}
                value={newCommentText}
                onChange={e => {
                  onCommentTextChange(post.id, e.target.value);
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
                    postId={post.id}
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
    </article>
  );
}
