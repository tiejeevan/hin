import { ArrowLeft } from 'lucide-react';
import { Post, Comment, User as UserType, SystemSettings } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { PostCard } from './PostCard';
import { AuthForm } from '../auth/AuthForm';

interface PostViewProps {
  post: Post | null;
  isLoading: boolean;
  error: { status: number; message: string } | null;
  currentUser: UserType | null;
  readOnly: boolean;
  highlightCommentId: number | null;
  commentsList: Comment[];
  isCommentsExpanded: boolean;
  newCommentText: string;
  replyingTo: Comment | null;
  editingPostId: number | null;
  editingPostContent: string;
  editingCommentId: number | null;
  editingCommentContent: string;
  showGuestAuth: boolean;
  isRegisterMode: boolean;
  usernameInput: string;
  passwordInput: string;
  authError: string | null;
  isAuthLoading: boolean;
  onBack: () => void;
  onSignIn: () => void;
  onAuthSubmit: (e: React.FormEvent) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleAuthMode: () => void;
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
  onCopyPermalink: () => void;
  onToggleBookmark: () => void;
  onShare: () => void;
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
  postLimits?: Pick<SystemSettings, 'maxPostLength' | 'maxMediaPerPost'>;
}

export function PostView({
  post,
  isLoading,
  error,
  currentUser,
  readOnly,
  highlightCommentId,
  commentsList,
  isCommentsExpanded,
  newCommentText,
  replyingTo,
  editingPostId,
  editingPostContent,
  editingCommentId,
  editingCommentContent,
  showGuestAuth,
  isRegisterMode,
  usernameInput,
  passwordInput,
  authError,
  isAuthLoading,
  onBack,
  onSignIn,
  onAuthSubmit,
  onUsernameChange,
  onPasswordChange,
  onToggleAuthMode,
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
  postLimits,
}: PostViewProps) {
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4 space-y-4">
        <div className="h-8 w-32 bg-bg-secondary rounded-lg animate-pulse" />
        <div className="h-48 bg-bg-secondary border border-border-custom rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    const isForbidden = error.status === 403;
    return (
      <div className="max-w-2xl mx-auto w-full p-4 space-y-4">
        {currentUser && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
        )}
        <div className="bg-bg-secondary border border-border-custom rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">
            {error.status === 404 ? 'Post not found' : isForbidden ? 'This post is not available' : 'Something went wrong'}
          </p>
          <p className="text-xs text-text-muted">{error.message}</p>
          {isForbidden && readOnly && (
            <button
              type="button"
              onClick={onSignIn}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl transition-colors cursor-pointer min-h-[44px]"
            >
              Sign in to view
            </button>
          )}
        </div>
        {showGuestAuth && (
          <AuthForm
            isRegisterMode={isRegisterMode}
            usernameInput={usernameInput}
            passwordInput={passwordInput}
            authError={authError}
            isAuthLoading={isAuthLoading}
            onSubmit={onAuthSubmit}
            onUsernameChange={onUsernameChange}
            onPasswordChange={onPasswordChange}
            onToggleMode={onToggleAuthMode}
          />
        )}
      </div>
    );
  }

  if (!post) return null;

  const postId = post.id;

  return (
    <div className="max-w-2xl mx-auto w-full p-4 pb-20 md:pb-4 space-y-4">
      {currentUser && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>
      )}

      {showGuestAuth && readOnly && (
        <AuthForm
          isRegisterMode={isRegisterMode}
          usernameInput={usernameInput}
          passwordInput={passwordInput}
          authError={authError}
          isAuthLoading={isAuthLoading}
          onSubmit={onAuthSubmit}
          onUsernameChange={onUsernameChange}
          onPasswordChange={onPasswordChange}
          onToggleMode={onToggleAuthMode}
        />
      )}

      <PostCard
        post={post}
        currentUser={currentUser}
        commentsList={commentsList}
        isCommentsExpanded={isCommentsExpanded}
        isNewlyCreated={false}
        editingPostId={editingPostId}
        editingPostContent={editingPostContent}
        newCommentText={newCommentText[postId] ?? ''}
        replyingTo={replyingTo}
        editingCommentId={editingCommentId}
        editingCommentContent={editingCommentContent}
        readOnly={readOnly}
        highlightCommentId={highlightCommentId}
        onSignInRequired={onSignIn}
        onCopyPermalink={onCopyPermalink}
        onToggleBookmark={onToggleBookmark}
        onShare={onShare}
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
        maxPostLength={postLimits?.maxPostLength}
      />
    </div>
  );
}
