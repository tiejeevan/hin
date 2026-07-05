import { useState, useRef, useEffect } from 'react';
import { Heart, MessageSquare, Shield, Trash2, Send, X, MoreVertical, Pencil, Globe, Users, Lock, Link2 } from 'lucide-react';
import { Post, Comment, User as UserType, PostVisibility } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { buildCommentTree } from '../../utils/comments';
import { CommentItem } from './CommentItem';
import { MentionsText } from './MentionsText';
import { ImageLightbox } from './ImageLightbox';
import { PostMediaGallery } from './PostMediaGallery';
import { PostPollBody } from './PostPollBody';
import { UserAvatar } from '../profile/UserAvatar';

interface PostCardProps {
  post: Post;
  currentUser: UserType | null;
  users: UserType[];
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
  readOnly?: boolean;
  highlightCommentId?: number | null;
  onSignInRequired?: () => void;
  onCopyPermalink?: () => void;
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
  onViewProfile: (userId: number) => void;
  onVotePoll: (postId: number, optionIds: number[]) => Promise<void>;
  onRetractPollVote: (postId: number) => Promise<void>;
  onClosePoll: (postId: number) => Promise<void>;
}

const VISIBILITY_META: Record<PostVisibility, { Icon: typeof Globe; title: string }> = {
  public: { Icon: Globe, title: 'Public' },
  followers: { Icon: Users, title: 'Followers only' },
  only_me: { Icon: Lock, title: 'Only me' },
};

export function PostCard({
  post,
  currentUser,
  users,
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
  readOnly = false,
  highlightCommentId = null,
  onSignInRequired,
  onCopyPermalink,
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
  onVotePoll,
  onRetractPollVote,
  onClosePoll,
}: PostCardProps) {
  const nestedComments = buildCommentTree(commentsList);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canManagePost = !readOnly && currentUser && (currentUser.role === 'admin' || currentUser.id === post.userId);
  const author = users.find(u => u.id === post.userId);
  const visibility = (post.visibility ?? 'public') as PostVisibility;
  const { Icon: VisibilityIcon, title: visibilityTitle } = VISIBILITY_META[visibility];

  const requireAuth = (action: () => void) => {
    if (readOnly || !currentUser) {
      onSignInRequired?.();
      return;
    }
    action();
  };

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
      {canManagePost && (
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
            </div>
          )}
        </div>
      )}

      {!hideAuthorHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <UserAvatar
              username={post.username}
              avatarUrl={author?.avatarUrl}
              size="sm"
              onClick={() => onViewProfile(post.userId)}
            />
            <div className="text-left">
              <button
                type="button"
                onClick={() => onViewProfile(post.userId)}
                className="text-xs font-bold text-text-primary flex items-center gap-1 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                {post.username}
                {author?.role === 'admin' && <Shield className="h-3 w-3 text-amber-500" />}
              </button>
              <span className="text-[9px] text-text-muted flex items-center gap-1">
                <span title={visibilityTitle} aria-label={visibilityTitle}>
                  <VisibilityIcon className="h-3 w-3" />
                </span>
                <button
                  type="button"
                  onClick={onCopyPermalink}
                  className="hover:text-indigo-400 transition-colors cursor-pointer"
                  title="Copy link"
                >
                  {new Date(post.createdAt).toLocaleDateString()}{' '}
                  {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
                {onCopyPermalink && (
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
          <div className="space-y-2.5 mt-2">
            <textarea
              rows={3}
              className="w-full bg-bg-primary border border-border-custom rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              value={editingPostContent}
              onChange={e => onEditPostContentChange(e.target.value)}
            />
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
              <MentionsText
                content={post.content}
                users={users}
                onViewProfile={onViewProfile}
                className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left"
              />
            )}
            {post.type === 'poll' && post.poll && (
              <PostPollBody
                post={post}
                poll={post.poll}
                isAuthor={!!currentUser && currentUser.id === post.userId}
                onVote={readOnly ? async () => { onSignInRequired?.(); } : onVotePoll}
                onRetractVote={readOnly ? async () => { onSignInRequired?.(); } : onRetractPollVote}
                onClosePoll={readOnly ? async () => {} : onClosePoll}
              />
            )}
          </>
        )}

        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <PostMediaGallery
            urls={post.mediaUrls}
            onImageClick={index => setLightboxIndex(index)}
          />
        )}

        {lightboxIndex !== null && post.mediaUrls.length > 0 && (
          <ImageLightbox
            images={post.mediaUrls}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </div>

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
      </div>

      {isCommentsExpanded && (
        <div className="border-t border-border-custom pt-4 mt-3 space-y-4 bg-bg-primary/20 p-3 rounded-xl border border-border-custom/60">
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
            <input
              type="text"
              required
              placeholder={replyingTo ? 'Write a reply...' : 'Write a comment...'}
              value={newCommentText}
              onChange={e => onCommentTextChange(post.id, e.target.value)}
              className="flex-grow bg-bg-primary border border-border-custom rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
            />
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

          <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
            {nestedComments.length === 0 ? (
              <p className="text-[11px] text-text-muted text-center py-2">No comments yet.</p>
            ) : (
              nestedComments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  depth={0}
                  postId={post.id}
                  currentUser={currentUser}
                  users={users}
                  readOnly={readOnly}
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
                  onSignInRequired={onSignInRequired}
                />
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}
