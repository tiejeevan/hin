import { Post, Comment, User as UserType, SystemSettings } from '@hin/types';
import { PostCard } from '../feed/PostCard';
import { CommentNode } from '../../types/ui';

interface ProfilePostsProps {
  posts: Post[];
  currentUser?: UserType;
  readOnly?: boolean;
  gamificationEnabled?: boolean;
  expandedComments: Record<number, boolean>;
  postComments: Record<number, Comment[]>;
  newCommentText: Record<number, string>;
  replyingTo: Record<number, Comment | null>;
  editingPostId: number | null;
  editingPostContent: string;
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
  onOpenPost: (postId: number) => void;
  onSignInRequired?: () => void;
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
  postLimits?: Pick<SystemSettings, 'maxPostLength' | 'maxMediaPerPost'>;
}

export function ProfilePosts({
  posts,
  currentUser,
  readOnly = false,
  gamificationEnabled = false,
  expandedComments,
  postComments,
  newCommentText,
  replyingTo,
  editingPostId,
  editingPostContent,
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
  onOpenPost,
  onSignInRequired,
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
  postLimits,
}: ProfilePostsProps) {
  const pinnedPosts = posts.filter(p => p.pinnedAt);
  const regularPosts = posts.filter(p => !p.pinnedAt);

  const renderPost = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      currentUser={currentUser ?? null}
      readOnly={readOnly}
      gamificationEnabled={gamificationEnabled}
      commentsList={postComments[post.id] || []}
      isCommentsExpanded={expandedComments[post.id] || false}
      isNewlyCreated={false}
      editingPostId={editingPostId}
      editingPostContent={editingPostContent}
      newCommentText={newCommentText[post.id] || ''}
      replyingTo={replyingTo[post.id] || null}
      editingCommentId={editingCommentId}
      editingCommentContent={editingCommentContent}
      hideAuthorHeader
      showPinnedBadge
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
      onViewProfile={onViewProfile}
      onViewHashtag={onViewHashtag}
      onVotePoll={onVotePoll}
      onRetractPollVote={onRetractPollVote}
      onClosePoll={onClosePoll}
      onOpenPost={onOpenPost}
      onSignInRequired={onSignInRequired}
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
      maxPostLength={postLimits?.maxPostLength}
    />
  );

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary text-left">Posts</h2>

      {posts.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border-custom rounded-2xl text-text-muted text-sm">
          No posts yet.
        </div>
      ) : (
        <>
          {pinnedPosts.length > 0 && (
            <div className="space-y-3">
              {pinnedPosts.map(renderPost)}
              {regularPosts.length > 0 && (
                <div className="border-t border-border-custom pt-3" />
              )}
            </div>
          )}
          {regularPosts.map(renderPost)}
        </>
      )}
    </div>
  );
}
