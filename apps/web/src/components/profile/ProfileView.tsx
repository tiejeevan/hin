import { ArrowLeft } from 'lucide-react';
import { Post, Comment, User as UserType } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePosts } from './ProfilePosts';

interface ProfileViewProps {
  profileUser: UserType | null;
  profilePosts: Post[];
  isLoading: boolean;
  loadError: string | null;
  currentUser: UserType;
  token: string;
  isEditing: boolean;
  users: UserType[];
  expandedComments: Record<number, boolean>;
  postComments: Record<number, Comment[]>;
  newCommentText: Record<number, string>;
  replyingTo: Record<number, Comment | null>;
  editingPostId: number | null;
  editingPostContent: string;
  editingCommentId: number | null;
  editingCommentContent: string;
  onBack: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onProfileSaved: (updated: UserType) => void;
  onStartChat: (user: UserType) => void;
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

export function ProfileView({
  profileUser,
  profilePosts,
  isLoading,
  loadError,
  currentUser,
  token,
  isEditing,
  users,
  expandedComments,
  postComments,
  newCommentText,
  replyingTo,
  editingPostId,
  editingPostContent,
  editingCommentId,
  editingCommentContent,
  onBack,
  onStartEdit,
  onCancelEdit,
  onProfileSaved,
  onStartChat,
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
}: ProfileViewProps) {
  const isOwnProfile = profileUser?.id === currentUser.id;

  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-6">
      <div className="max-w-2xl mx-auto w-full space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </button>

      {isLoading ? (
        <div className="text-center py-16 text-text-muted text-sm">Loading profile...</div>
      ) : loadError ? (
        <div className="text-center py-16 text-rose-400 text-sm">{loadError}</div>
      ) : profileUser ? (
        <>
          <ProfileHeader
            user={profileUser}
            isOwnProfile={isOwnProfile}
            isEditing={isEditing}
            token={token}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onProfileSaved={onProfileSaved}
            onStartChat={onStartChat}
          />

          {!isEditing && (
            <ProfilePosts
              posts={profilePosts}
              users={users}
              currentUser={currentUser}
              expandedComments={expandedComments}
              postComments={postComments}
              newCommentText={newCommentText}
              replyingTo={replyingTo}
              editingPostId={editingPostId}
              editingPostContent={editingPostContent}
              editingCommentId={editingCommentId}
              editingCommentContent={editingCommentContent}
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
            />
          )}
        </>
      ) : null}
      </div>
    </div>
  );
}
