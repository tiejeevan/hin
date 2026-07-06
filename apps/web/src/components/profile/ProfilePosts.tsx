import { Post, Comment, User as UserType } from '@hin/types';
import { PostCard } from '../feed/PostCard';
import { CommentNode } from '../../types/ui';

interface ProfilePostsProps {
  posts: Post[];
  currentUser: UserType;
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
  onVotePoll: (postId: number, optionIds: number[]) => Promise<void>;
  onRetractPollVote: (postId: number) => Promise<void>;
  onClosePoll: (postId: number) => Promise<void>;
  onOpenPost: (postId: number) => void;
}

export function ProfilePosts({
  posts,
  currentUser,
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
  onVotePoll,
  onRetractPollVote,
  onClosePoll,
  onOpenPost,
}: ProfilePostsProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary text-left">Posts</h2>

      {posts.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border-custom rounded-2xl text-text-muted text-sm">
          No posts yet.
        </div>
      ) : (
        posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentUser={currentUser}
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
            onVotePoll={onVotePoll}
            onRetractPollVote={onRetractPollVote}
            onClosePoll={onClosePoll}
            onOpenPost={onOpenPost}
          />
        ))
      )}
    </div>
  );
}
