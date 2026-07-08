import { ArrowLeft, Lock } from 'lucide-react';
import { FollowRequest, Post, Comment, User as UserType, UserSettings, SystemSettings, type GamificationPublic } from '@hin/types';
import { GoalProgress } from '../gamification/GoalProgress';
import { CommentNode } from '../../types/ui';
import { AuthForm } from '../auth/AuthForm';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePosts } from './ProfilePosts';
import { ProfileSettingsPanel } from './ProfileSettingsPanel';

interface ProfileViewProps {
  profileUser: UserType | null;
  profilePosts: Post[];
  followRequests: FollowRequest[];
  isLoading: boolean;
  loadError: string | null;
  profilePostsError: string | null;
  currentUser?: UserType;
  token?: string;
  readOnly?: boolean;
  userSettings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
  isEditing: boolean;
  isSettingsOpen: boolean;
  highlightSettings?: boolean;
  followBusy: boolean;
  expandedComments: Record<number, boolean>;
  postComments: Record<number, Comment[]>;
  newCommentText: Record<number, string>;
  replyingTo: Record<number, Comment | null>;
  editingPostId: number | null;
  editingPostContent: string;
  editingCommentId: number | null;
  editingCommentContent: string;
  showGuestAuth?: boolean;
  isRegisterMode?: boolean;
  usernameInput?: string;
  passwordInput?: string;
  authError?: string | null;
  isAuthLoading?: boolean;
  onBack: () => void;
  onSignIn?: () => void;
  onAuthSubmit?: (e: React.FormEvent) => void;
  onUsernameChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
  onToggleAuthMode?: () => void;
  onGoogleCredential?: (credential: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onProfileSaved: (updated: UserType) => void;
  onStartChat: (user: UserType) => void;
  onFollow: (userId: number) => void;
  onUnfollow: (userId: number) => void;
  onCancelFollowRequest: (userId: number) => void;
  onBlockUser: (userId: number) => void;
  onUnblockUser: (userId: number) => void;
  onMuteUser: (userId: number) => void;
  onUnmuteUser: (userId: number) => void;
  onApproveFollowRequest: (requesterId: number) => Promise<void>;
  onRejectFollowRequest: (requesterId: number) => Promise<void>;
  onShowFollowers: () => void;
  onShowFollowing: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
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
  onCopyPermalink?: () => void;
  onReport?: () => void;
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
  threadPosts?: import('@hin/types').Post[];
  postLimits?: Pick<SystemSettings, 'maxPostLength' | 'maxMediaPerPost'>;
  onDeleteAccount?: (password: string) => Promise<{ success: boolean; error?: string }>;
  profileGamification?: GamificationPublic | null;
  showGamification?: boolean;
  gamificationEnabled?: boolean;
  onToggleEquipBadge?: (badgeId: number) => void;
}

export function ProfileView({
  profileUser,
  profilePosts,
  followRequests,
  isLoading,
  loadError,
  profilePostsError,
  currentUser,
  token,
  readOnly = false,
  userSettings,
  onSettingsChange,
  isEditing,
  isSettingsOpen,
  highlightSettings = false,
  followBusy,
  expandedComments,
  postComments,
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
  onGoogleCredential,
  onStartEdit,
  onCancelEdit,
  onProfileSaved,
  onStartChat,
  onFollow,
  onUnfollow,
  onCancelFollowRequest,
  onBlockUser,
  onUnblockUser,
  onMuteUser,
  onUnmuteUser,
  onApproveFollowRequest,
  onRejectFollowRequest,
  onShowFollowers,
  onShowFollowing,
  onOpenSettings,
  onCloseSettings,
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
  onCopyPermalink,
  onReport,
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
  onDeleteAccount,
  profileGamification,
  showGamification = false,
  gamificationEnabled = false,
  onToggleEquipBadge,
}: ProfileViewProps) {
  const isOwnProfile = !!currentUser && profileUser?.id === currentUser.id;
  const canViewPosts = profileUser?.canViewPosts !== false;
  const hasVisiblePosts = profilePosts.length > 0;
  const showPostsSection = !isEditing && !isSettingsOpen && (canViewPosts || hasVisiblePosts);
  const showPrivateEmptyState = !isEditing && !isSettingsOpen && !canViewPosts && !hasVisiblePosts;

  const handleSignInRequired = readOnly ? onSignIn : undefined;

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
            token={token ?? ''}
            readOnly={readOnly}
            followBusy={followBusy}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onProfileSaved={onProfileSaved}
            onStartChat={onStartChat}
            onFollow={onFollow}
            onUnfollow={onUnfollow}
            onCancelFollowRequest={onCancelFollowRequest}
            onBlockUser={onBlockUser}
            onUnblockUser={onUnblockUser}
            onMuteUser={onMuteUser}
            onUnmuteUser={onUnmuteUser}
            onShowFollowers={onShowFollowers}
            onShowFollowing={onShowFollowing}
            pendingRequestCount={followRequests.length}
            isSettingsOpen={isSettingsOpen}
            onOpenSettings={onOpenSettings}
            onCopyPermalink={onCopyPermalink}
            onReport={onReport}
            onSignInRequired={handleSignInRequired}
            gamification={profileGamification}
            showGamification={showGamification}
            onToggleEquipBadge={isOwnProfile ? onToggleEquipBadge : undefined}
          />

          {isOwnProfile && showGamification && gamificationEnabled && profileGamification && profileGamification.goalsInProgress.length > 0 && !isEditing && !isSettingsOpen && (
            <GoalProgress goals={profileGamification.goalsInProgress} />
          )}

          {isOwnProfile && isSettingsOpen && !isEditing && token && (
            <ProfileSettingsPanel
              settings={userSettings}
              token={token}
              username={profileUser.username}
              requests={followRequests}
              highlighted={highlightSettings}
              onSettingsChange={onSettingsChange}
              onApprove={onApproveFollowRequest}
              onReject={onRejectFollowRequest}
              onViewProfile={onViewProfile}
              onClose={onCloseSettings}
              onUnblockUser={onUnblockUser}
              onUnmuteUser={onUnmuteUser}
              onDeleteAccount={onDeleteAccount!}
            />
          )}

          {showPrivateEmptyState && (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border-custom rounded-2xl text-text-muted gap-3">
              <Lock className="h-8 w-8 text-text-muted/70" />
              <p className="text-sm font-medium text-text-secondary">This account is private</p>
              <p className="text-xs">
                {readOnly ? 'Sign in and follow this account to see their posts.' : 'Follow this account to see their posts.'}
              </p>
              {readOnly && onSignIn && (
                <button
                  type="button"
                  onClick={onSignIn}
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                >
                  Sign in
                </button>
              )}
            </div>
          )}

          {showPostsSection && (
            <>
              {!canViewPosts && hasVisiblePosts && (
                <p className="text-xs text-text-muted text-center">Follow this account to see more posts.</p>
              )}
              {profilePostsError && (
                <p className="text-xs text-rose-400 text-center">{profilePostsError}</p>
              )}
              <ProfilePosts
                posts={profilePosts}
                currentUser={currentUser}
                readOnly={readOnly}
                gamificationEnabled={gamificationEnabled}
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
                onViewHashtag={onViewHashtag}
                onVotePoll={onVotePoll}
                onRetractPollVote={onRetractPollVote}
                onClosePoll={onClosePoll}
                onOpenPost={onOpenPost}
                onSignInRequired={handleSignInRequired}
                onReportPost={onReportPost}
                onReportComment={onReportComment}
                onPinPost={onPinPost}
                onUnpinPost={onUnpinPost}
                onStartThreadReply={onStartThreadReply}
                onCancelThreadReply={onCancelThreadReply}
                onSubmitThreadReply={onSubmitThreadReply}
                threadReplyTargetId={threadReplyTargetId}
                threadReplyContent={threadReplyContent}
                onThreadReplyContentChange={onThreadReplyContentChange}
                postLimits={postLimits}
              />
            </>
          )}
        </>
      ) : null}

      {showGuestAuth && readOnly && onAuthSubmit && onUsernameChange && onPasswordChange && onToggleAuthMode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-sm rounded-2xl border border-border-custom bg-bg-secondary p-6 shadow-xl">
            <AuthForm
              isRegisterMode={!!isRegisterMode}
              usernameInput={usernameInput ?? ''}
              passwordInput={passwordInput ?? ''}
              authError={authError ?? null}
              isAuthLoading={!!isAuthLoading}
              onSubmit={onAuthSubmit}
              onUsernameChange={onUsernameChange}
              onPasswordChange={onPasswordChange}
              onToggleMode={onToggleAuthMode}
              onGoogleCredential={onGoogleCredential}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
