import { useEffect, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Post, Comment, User as UserType } from '@hin/types';
import { CommentNode, FeedMode } from '../../types/ui';
import { CreatePostForm } from './CreatePostForm';
import type { CreatePostSubmitPayload } from './CreatePostForm';
import { PostCard } from './PostCard';
import { FloatingActionStack } from '../ui/FloatingActionStack';

interface FeedViewProps {
  posts: Post[];
  users: UserType[];
  currentUser: UserType;
  showNewPostForm: boolean;
  showMessagesDropdown: boolean;
  unreadMessagesCount: number;
  messageIconPulseAt: number;
  newPostContent: string;
  token: string;
  newlyCreatedPostId: number | null;
  expandedComments: Record<number, boolean>;
  postComments: Record<number, Comment[]>;
  newCommentText: Record<number, string>;
  replyingTo: Record<number, Comment | null>;
  editingPostId: number | null;
  editingPostContent: string;
  editingCommentId: number | null;
  editingCommentContent: string;
  isLoadingMore: boolean;
  hasMorePosts: boolean;
  feedMode: FeedMode;
  onFeedModeChange: (mode: FeedMode) => void;
  onLoadMore: () => void;
  onOpenCreatePost: () => void;
  onCloseCreatePost: () => void;
  onToggleMessages: () => void;
  onNewPostContentChange: (value: string) => void;
  onCreatePost: (e: React.FormEvent, payload: CreatePostSubmitPayload) => void | Promise<void>;
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
  onViewProfile: (userId: number) => void;
  onDeleteComment: (postId: number, commentId: number) => void;
  onStartCommentEdit: (commentId: number, content: string) => void;
  onCancelCommentEdit: () => void;
  onSaveCommentEdit: (postId: number, commentId: number) => void;
  onEditCommentContentChange: (content: string) => void;
  onReply: (postId: number, comment: CommentNode) => void;
  onToggleCommentLike: (postId: number, commentId: number) => void;
  onVotePoll: (postId: number, optionIds: number[]) => Promise<void>;
  onRetractPollVote: (postId: number) => Promise<void>;
  onClosePoll: (postId: number) => Promise<void>;
}

export function FeedView({
  posts,
  users,
  currentUser,
  showNewPostForm,
  showMessagesDropdown,
  unreadMessagesCount,
  messageIconPulseAt,
  newPostContent,
  token,
  newlyCreatedPostId,
  expandedComments,
  postComments,
  newCommentText,
  replyingTo,
  editingPostId,
  editingPostContent,
  editingCommentId,
  editingCommentContent,
  isLoadingMore,
  hasMorePosts,
  feedMode,
  onFeedModeChange,
  onLoadMore,
  onOpenCreatePost,
  onCloseCreatePost,
  onToggleMessages,
  onNewPostContentChange,
  onCreatePost,
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
  onViewProfile,
  onDeleteComment,
  onStartCommentEdit,
  onCancelCommentEdit,
  onSaveCommentEdit,
  onEditCommentContentChange,
  onReply,
  onToggleCommentLike,
  onVotePoll,
  onRetractPollVote,
  onClosePoll,
}: FeedViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMorePosts) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          onLoadMore();
        }
      },
      { root, rootMargin: '200px', threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMorePosts, isLoadingMore, onLoadMore, posts.length]);

  return (
    <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 md:p-6 relative">
      <div className="max-w-2xl mx-auto w-full space-y-4 pb-20 md:pb-4">
      <div className="flex p-1 bg-bg-secondary border border-border-custom rounded-xl">
        {(['all', 'following'] as FeedMode[]).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => onFeedModeChange(mode)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] ${
              feedMode === mode
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {mode === 'all' ? 'Everyone' : 'Following'}
          </button>
        ))}
      </div>

      <div className="hidden md:flex justify-end">
        <button
          onClick={onOpenCreatePost}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          Create Post
        </button>
      </div>

      {showNewPostForm && (
        <CreatePostForm
          content={newPostContent}
          token={token}
          onContentChange={onNewPostContentChange}
          onSubmit={onCreatePost}
          onClose={onCloseCreatePost}
        />
      )}

      <div className="space-y-4">
        {posts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border-custom rounded-2xl text-text-muted text-sm">
            {feedMode === 'following'
              ? 'Follow people to see their posts here.'
              : 'No posts yet. Be the first to publish!'}
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                users={users}
                commentsList={postComments[post.id] || []}
                isCommentsExpanded={expandedComments[post.id] || false}
                isNewlyCreated={newlyCreatedPostId === post.id}
                editingPostId={editingPostId}
                editingPostContent={editingPostContent}
                newCommentText={newCommentText[post.id] || ''}
                replyingTo={replyingTo[post.id] || null}
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
                onViewProfile={onViewProfile}
                onDeleteComment={onDeleteComment}
                onStartCommentEdit={onStartCommentEdit}
                onCancelCommentEdit={onCancelCommentEdit}
                onSaveCommentEdit={onSaveCommentEdit}
                onEditCommentContentChange={onEditCommentContentChange}
                onReply={onReply}
                onToggleCommentLike={onToggleCommentLike}
                onVotePoll={onVotePoll}
                onRetractPollVote={onRetractPollVote}
                onClosePoll={onClosePoll}
              />
            ))}
            <div ref={sentinelRef} className="h-1" aria-hidden />
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-2 py-4 text-text-muted text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more posts…
              </div>
            )}
            {!hasMorePosts && posts.length > 0 && (
              <p className="text-center text-text-muted text-xs py-3">You're all caught up</p>
            )}
          </>
        )}
      </div>
      </div>

      <FloatingActionStack
        showNewPostForm={showNewPostForm}
        showMessagesDropdown={showMessagesDropdown}
        unreadMessagesCount={unreadMessagesCount}
        messageIconPulseAt={messageIconPulseAt}
        onOpenCreatePost={onOpenCreatePost}
        onToggleMessages={onToggleMessages}
      />
    </div>
  );
}
