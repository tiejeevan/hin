import { Trash2 } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { CommentNode } from '../../types/ui';

interface CommentItemProps {
  comment: CommentNode;
  depth: number;
  postId: number;
  currentUser: UserType;
  editingCommentId: number | null;
  editingCommentContent: string;
  onDeleteComment: (postId: number, commentId: number) => void;
  onStartEdit: (commentId: number, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (postId: number, commentId: number) => void;
  onEditContentChange: (content: string) => void;
  onReply: (postId: number, comment: CommentNode) => void;
}

export function CommentItem({
  comment,
  depth = 0,
  postId,
  currentUser,
  editingCommentId,
  editingCommentContent,
  onDeleteComment,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditContentChange,
  onReply,
}: CommentItemProps) {
  const isDeleted = !!comment.deletedAt || comment.username === 'deleted';
  const isEditing = editingCommentId === comment.id;

  return (
    <div
      className="space-y-2 text-left"
      style={{ marginLeft: depth > 0 ? `${Math.min(depth * 14, 56)}px` : '0px' }}
    >
      <div
        className={`flex gap-2.5 text-xs border-b border-border-custom pb-2.5 relative group ${
          depth > 0 ? 'border-l border-border-custom/40 pl-3.5' : ''
        }`}
      >
        {!isDeleted && (currentUser.role === 'admin' || currentUser.id === comment.userId) && (
          <button
            onClick={() => onDeleteComment(postId, comment.id)}
            className="absolute right-0 top-0.5 text-text-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Delete Comment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="h-6 w-6 rounded-full bg-bg-tertiary flex items-center justify-center font-bold text-[10px] uppercase text-text-muted shrink-0 border border-border-custom">
          {isDeleted ? '?' : comment.username[0]}
        </div>

        <div className="flex-grow min-w-0 text-left pr-6">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-semibold ${isDeleted ? 'text-text-muted font-mono' : 'text-text-primary'}`}>
              {isDeleted ? '[deleted]' : `@${comment.username}`}
            </span>
            <span className="text-[9px] text-text-muted">
              {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {isEditing ? (
            <div className="space-y-2 mt-1.5">
              <input
                type="text"
                className="w-full bg-bg-primary border border-border-custom rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
                value={editingCommentContent}
                onChange={e => onEditContentChange(e.target.value)}
              />
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={onCancelEdit}
                  className="px-2.5 py-1 rounded-lg text-[10px] text-text-muted hover:bg-bg-tertiary hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onSaveEdit(postId, comment.id)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold px-3 py-1 rounded-lg transition-all shadow-md cursor-pointer min-h-[44px]"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className={`${isDeleted ? 'text-text-muted italic mt-1' : 'text-text-secondary'} text-xs mt-0.5 leading-relaxed break-words`}>
              {comment.content}
            </p>
          )}

          {!isDeleted && !isEditing && (
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onReply(postId, comment)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors cursor-pointer min-h-[44px] px-1"
              >
                Reply
              </button>
              {(currentUser.role === 'admin' || currentUser.id === comment.userId) && (
                <button
                  onClick={() => onStartEdit(comment.id, comment.content)}
                  className="text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer min-h-[44px] px-1"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {comment.replies?.map(reply => (
        <CommentItem
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          postId={postId}
          currentUser={currentUser}
          editingCommentId={editingCommentId}
          editingCommentContent={editingCommentContent}
          onDeleteComment={onDeleteComment}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onEditContentChange={onEditContentChange}
          onReply={onReply}
        />
      ))}
    </div>
  );
}
