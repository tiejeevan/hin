import { Heart, MessageSquare, MessageCircle, Shield, Trash2, Send, X } from 'lucide-react';
import { Post, Comment, User as UserType } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { buildCommentTree } from '../../utils/comments';
import { CommentItem } from './CommentItem';

interface PostCardProps {
  post: Post;
  currentUser: UserType;
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
  onStartChat: (user: UserType) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
  onStartCommentEdit: (commentId: number, content: string) => void;
  onCancelCommentEdit: () => void;
  onSaveCommentEdit: (postId: number, commentId: number) => void;
  onEditCommentContentChange: (content: string) => void;
  onReply: (postId: number, comment: CommentNode) => void;
}

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
  onStartChat,
  onDeleteComment,
  onStartCommentEdit,
  onCancelCommentEdit,
  onSaveCommentEdit,
  onEditCommentContentChange,
  onReply,
}: PostCardProps) {
  const nestedComments = buildCommentTree(commentsList);

  return (
    <article
      className={`bg-bg-secondary border border-border-custom rounded-2xl p-4 space-y-4 shadow-sm hover:border-border-custom transition-all relative ${
        isNewlyCreated ? 'animate-blink-border' : ''
      }`}
    >
      {(currentUser.role === 'admin' || currentUser.id === post.userId) && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <button
            onClick={() => onStartPostEdit(post.id, post.content)}
            className="p-1.5 bg-indigo-500/10 border border-indigo-500/25 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Edit Post"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onDeletePost(post.id)}
            className="p-1.5 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Delete Post"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-bg-tertiary border border-border-custom flex items-center justify-center font-bold text-xs uppercase text-text-secondary">
            {post.username[0]}
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-text-primary flex items-center gap-1">
              @{post.username}
              {users.find(u => u.id === post.userId)?.role === 'admin' && (
                <Shield className="h-3 w-3 text-amber-500" />
              )}
            </p>
            <span className="text-[9px] text-text-muted">
              {new Date(post.createdAt).toLocaleDateString()}{' '}
              {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {post.userId !== currentUser.id && (
          <button
            onClick={() => {
              const authorUser = users.find(u => u.id === post.userId);
              if (authorUser) onStartChat(authorUser);
            }}
            className="text-text-muted hover:text-indigo-400 p-1.5 rounded-lg hover:bg-bg-tertiary transition-all mr-8 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title={`Chat with @${post.username}`}
          >
            <MessageCircle className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

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
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line text-left">{post.content}</p>
        )}

        {post.mediaUrl && (
          <div className="rounded-xl overflow-hidden border border-border-custom bg-bg-primary max-h-80 flex items-center justify-center">
            <img
              src={post.mediaUrl}
              alt="Post attachment"
              className="max-w-full max-h-80 object-contain"
              onError={e => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-6 border-t border-border-custom/40 pt-3">
        <button
          onClick={() => onToggleLike(post.id)}
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
          {replyingTo && (
            <div className="flex items-center justify-between bg-indigo-950/20 border border-indigo-900/30 rounded-xl px-3 py-1.5 text-[11px] text-indigo-300">
              <span>
                Replying to <strong>@{replyingTo.username}</strong>
              </span>
              <button
                onClick={() => onCancelReply(post.id)}
                className="text-text-muted hover:text-text-primary p-0.5 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

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
                  editingCommentId={editingCommentId}
                  editingCommentContent={editingCommentContent}
                  onDeleteComment={onDeleteComment}
                  onStartEdit={onStartCommentEdit}
                  onCancelEdit={onCancelCommentEdit}
                  onSaveEdit={onSaveCommentEdit}
                  onEditContentChange={onEditCommentContentChange}
                  onReply={onReply}
                />
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}
