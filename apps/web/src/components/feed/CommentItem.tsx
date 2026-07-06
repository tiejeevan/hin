import { useEffect, useRef, useState } from 'react';
import { Heart, MoreVertical, Pencil, Trash2, Flag } from 'lucide-react';
import { User as UserType } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { PostContentText } from './PostContentText';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';
import { MentionSuggestions } from '../ui/MentionSuggestions';

interface CommentItemProps {
  comment: CommentNode;
  depth: number;
  postId: number;
  currentUser: UserType | null;
  readOnly?: boolean;
  editingCommentId: number | null;
  editingCommentContent: string;
  onDeleteComment: (postId: number, commentId: number) => void;
  onStartEdit: (commentId: number, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (postId: number, commentId: number) => void;
  onEditContentChange: (content: string) => void;
  onReply: (postId: number, comment: CommentNode) => void;
  onToggleCommentLike: (postId: number, commentId: number) => void;
  onViewProfile: (userIdOrUsername: number | string) => void;
  onViewHashtag?: (tag: string) => void;
  onSignInRequired?: () => void;
  onReport?: (commentId: number) => void;
}

export function CommentItem({
  comment,
  depth = 0,
  postId,
  currentUser,
  readOnly = false,
  editingCommentId,
  editingCommentContent,
  onDeleteComment,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditContentChange,
  onReply,
  onToggleCommentLike,
  onViewProfile,
  onViewHashtag,
  onSignInRequired,
  onReport,
}: CommentItemProps) {
  const token = localStorage.getItem('hin_token');
  const commentEditAutocomplete = useMentionAutocomplete({
    value: editingCommentContent,
    onChange: onEditContentChange,
    token,
  });
  const isDeleted = !!comment.deletedAt || comment.username === 'deleted';
  const isEditing = editingCommentId === comment.id;
  const canManage = !readOnly && !isDeleted && currentUser && (currentUser.role === 'admin' || currentUser.id === comment.userId);
  const canReport = !readOnly && !isDeleted && currentUser && currentUser.id !== comment.userId && onReport;
  const showMenu = canManage || canReport;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div
      id={`comment-${comment.id}`}
      className="space-y-2 text-left scroll-mt-24"
      style={{ marginLeft: depth > 0 ? `${Math.min(depth * 14, 56)}px` : '0px' }}
    >
      <div
        className={`flex gap-2.5 text-xs border-b border-border-custom pb-2.5 relative ${
          depth > 0 ? 'border-l border-border-custom/40 pl-3.5' : ''
        }`}
      >
        <div className="h-6 w-6 rounded-full bg-bg-tertiary flex items-center justify-center font-bold text-[10px] uppercase text-text-muted shrink-0 border border-border-custom">
          {isDeleted ? '?' : comment.username[0]}
        </div>

        <div className="flex-grow min-w-0 text-left">
          <div className="flex items-start gap-2">
            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`font-semibold ${isDeleted ? 'text-text-muted font-mono' : 'text-text-primary'}`}>
                  {isDeleted ? '[deleted]' : `@${comment.username}`}
                </span>
                <span className="text-[9px] text-text-muted">
                  {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {isEditing ? (
                <div className="space-y-2 mt-1.5 relative">
                  <input
                    ref={commentEditAutocomplete.inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    className="w-full bg-bg-primary border border-border-custom rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-indigo-500 transition-colors min-h-[44px]"
                    value={editingCommentContent}
                    onChange={e => {
                      onEditContentChange(e.target.value);
                      commentEditAutocomplete.handleInputChange(e);
                    }}
                    onKeyDown={commentEditAutocomplete.handleKeyDown}
                  />
                  {commentEditAutocomplete.showDropdown && (
                    <MentionSuggestions
                      suggestions={commentEditAutocomplete.suggestions}
                      activeIndex={commentEditAutocomplete.activeIndex}
                      onSelect={commentEditAutocomplete.selectSuggestion}
                    />
                  )}
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
              ) : isDeleted ? (
                <p className="text-text-muted italic mt-1 text-xs leading-relaxed break-words">
                  {comment.content}
                </p>
              ) : (
                <PostContentText
                  content={comment.content}
                  onViewProfile={onViewProfile}
                  onViewHashtag={onViewHashtag}
                  className="text-text-secondary text-xs mt-0.5 leading-relaxed break-words"
                />
              )}
            </div>

            {showMenu && !isEditing && (
              <div ref={menuRef} className="relative shrink-0 -mt-0.5">
                <button
                  type="button"
                  onClick={() => setMenuOpen(prev => !prev)}
                  className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title="Comment options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 w-32 rounded-xl border border-border-custom bg-bg-secondary shadow-lg overflow-hidden z-20"
                  >
                    {canManage && (
                      <>
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onStartEdit(comment.id, comment.content);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-indigo-400 transition-colors cursor-pointer min-h-[40px]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          role="menuitem"
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onDeleteComment(postId, comment.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer min-h-[40px]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </>
                    )}
                    {canReport && (
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onReport!(comment.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer min-h-[40px]"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        Report
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isDeleted && !isEditing && !readOnly && (
            <div className="flex items-center gap-3 mt-1.5">
              <button
                type="button"
                onClick={() => onToggleCommentLike(postId, comment.id)}
                className={`flex items-center gap-1 text-[10px] transition-colors cursor-pointer min-h-[32px] px-0.5 ${
                  comment.hasLiked ? 'text-rose-500 font-semibold' : 'text-text-muted hover:text-rose-400'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${comment.hasLiked ? 'fill-rose-500' : ''}`} />
                <span>{comment.likesCount || 0}</span>
              </button>
              <button
                type="button"
                onClick={() => onReply(postId, comment)}
                className="text-[10px] text-text-muted hover:text-indigo-400 font-semibold transition-colors cursor-pointer min-h-[32px] px-0.5"
              >
                Reply
              </button>
            </div>
          )}
          {!isDeleted && !isEditing && readOnly && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-text-muted">
              <Heart className="h-3.5 w-3.5" />
              <span>{comment.likesCount || 0}</span>
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
          readOnly={readOnly}
          editingCommentId={editingCommentId}
          editingCommentContent={editingCommentContent}
          onDeleteComment={onDeleteComment}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onEditContentChange={onEditContentChange}
          onReply={onReply}
          onToggleCommentLike={onToggleCommentLike}
          onViewProfile={onViewProfile}
          onViewHashtag={onViewHashtag}
          onSignInRequired={onSignInRequired}
        />
      ))}
    </div>
  );
}
