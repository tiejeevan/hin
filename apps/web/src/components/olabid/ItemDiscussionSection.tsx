import { useMemo, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { ItemComment, User as UserType } from '@hin/types';
import { ItemCommentNode } from '../../types/ui';
import { buildItemCommentTree } from '../../utils/comments';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import { ItemCommentItem } from './ItemCommentItem';

const COMMENTS_PAGE_SIZE = 10;

interface ItemDiscussionSectionProps {
  olabidItemId: number;
  comments: ItemComment[];
  currentUser: UserType | null;
  gamificationEnabled?: boolean;
  newCommentText: string;
  replyingTo: ItemComment | null;
  editingCommentId: number | null;
  editingCommentContent: string;
  onCommentTextChange: (text: string) => void;
  onCreateComment: (e: React.FormEvent) => void;
  onCancelReply: () => void;
  onReply: (olabidItemId: number, comment: ItemCommentNode) => void;
  onDeleteComment: (olabidItemId: number, commentId: number) => void;
  onStartEdit: (commentId: number, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (olabidItemId: number, commentId: number) => void;
  onEditContentChange: (content: string) => void;
  onToggleCommentLike: (olabidItemId: number, commentId: number) => void;
  onViewProfile: (userIdOrUsername: number | string) => void;
  onViewHashtag?: (tag: string) => void;
  onSignInRequired?: () => void;
}

export function ItemDiscussionSection({
  olabidItemId,
  comments,
  currentUser,
  gamificationEnabled = false,
  newCommentText,
  replyingTo,
  editingCommentId,
  editingCommentContent,
  onCommentTextChange,
  onCreateComment,
  onCancelReply,
  onReply,
  onDeleteComment,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditContentChange,
  onToggleCommentLike,
  onViewProfile,
  onViewHashtag,
  onSignInRequired,
}: ItemDiscussionSectionProps) {
  const [visibleCount, setVisibleCount] = useState(COMMENTS_PAGE_SIZE);
  const token = localStorage.getItem('hin_token');
  const commentAutocomplete = useMentionAutocomplete({
    value: newCommentText,
    onChange: onCommentTextChange,
    token,
  });

  const nestedComments = useMemo(() => buildItemCommentTree(comments), [comments]);
  const activeCount = comments.filter(c => !c.deletedAt && c.username !== 'deleted').length;
  const readOnly = !currentUser;

  return (
    <section className="rounded-2xl border border-border bg-bg-secondary p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4.5 w-4.5 text-amber-500" />
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
          Discussion
        </h2>
        <span className="text-xs text-text-muted">({activeCount})</span>
      </div>

      {replyingTo && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-bg-tertiary text-xs">
          <span className="text-text-secondary truncate">
            Replying to <span className="font-semibold text-text-primary">@{replyingTo.username}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors cursor-pointer"
            title="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!readOnly ? (
        <form onSubmit={onCreateComment} className="flex items-center gap-2">
          <div className="relative flex-grow">
            <input
              ref={commentAutocomplete.inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              required
              placeholder={replyingTo ? 'Write a reply...' : 'Join the discussion...'}
              value={newCommentText}
              onChange={e => {
                onCommentTextChange(e.target.value);
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
      ) : (
        <p className="text-[11px] text-text-muted text-center">
          <button
            type="button"
            onClick={onSignInRequired}
            className="text-indigo-400 hover:underline cursor-pointer"
          >
            Sign in
          </button>{' '}
          to join the discussion
        </p>
      )}

      <div className="space-y-3.5">
        {nestedComments.length === 0 ? (
          <p className="text-[11px] text-text-muted text-center py-2">No comments yet. Start the conversation!</p>
        ) : (
          <>
            {nestedComments.slice(0, visibleCount).map(comment => (
              <ItemCommentItem
                key={comment.id}
                comment={comment}
                depth={0}
                olabidItemId={olabidItemId}
                currentUser={currentUser}
                readOnly={readOnly}
                gamificationEnabled={gamificationEnabled}
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
            {nestedComments.length > visibleCount && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setVisibleCount(count => count + COMMENTS_PAGE_SIZE)}
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer py-1"
                >
                  Show more ({nestedComments.length - visibleCount})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
