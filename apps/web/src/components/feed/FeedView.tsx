import { useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Post, Comment, User as UserType, SystemSettings, LinkPreview } from '@hin/types';
import { CommentNode, FeedMode } from '../../types/ui';
import { CreatePostForm } from './CreatePostForm';
import type { CreatePostSubmitPayload } from './CreatePostForm';
import { PostCard } from './PostCard';
import { FeedModeSelector } from './FeedModeSelector';
import { ExploreHashtags } from './ExploreHashtags';
import { ActiveEventsBanner } from '../gamification/ActiveEventsBanner';

interface FeedViewProps {
  posts: Post[];
  currentUser: UserType;
  showNewPostForm: boolean;
  newPostContent: string;
  postSeedPreview?: LinkPreview | null;
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
  activeHashtag?: string | null;
  onSelectHashtag?: (tag: string) => void;
  onLoadMore: () => void;
  onCloseCreatePost: () => void;
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
  onViewProfile: (userIdOrUsername: number | string) => void;
  onViewHashtag?: (tag: string) => void;
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
  onOpenPost: (postId: number) => void;
  onOpenOlabidItem?: (itemId: number) => void;
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
  gamificationEnabled?: boolean;
  onGamificationRefresh?: () => void;
}

export function FeedView({
  posts,
  currentUser,
  showNewPostForm,
  newPostContent,
  postSeedPreview = null,
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
  activeHashtag = null,
  onSelectHashtag,
  onLoadMore,
  onCloseCreatePost,
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
  onViewHashtag,
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
  onOpenPost,
  onOpenOlabidItem,
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
  gamificationEnabled = false,
  onGamificationRefresh,
}: FeedViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(onLoadMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const hasMorePostsRef = useRef(hasMorePosts);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
    isLoadingMoreRef.current = isLoadingMore;
    hasMorePostsRef.current = hasMorePosts;
  });

  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      const observer = new IntersectionObserver(
        entries => {
          if (entries[0]?.isIntersecting && !isLoadingMoreRef.current && hasMorePostsRef.current) {
            loadMoreRef.current();
          }
        },
        { root: null, rootMargin: '200px', threshold: 0 }
      );
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  return (
    <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 md:p-6 relative">
      <div className="max-w-2xl mx-auto w-full space-y-4 pb-20 md:pb-4">
      <FeedModeSelector feedMode={feedMode} onFeedModeChange={onFeedModeChange} />

      {gamificationEnabled && (
        <ActiveEventsBanner token={token} onGamificationRefresh={onGamificationRefresh} />
      )}

      {feedMode === 'explore' && onSelectHashtag && (
        <ExploreHashtags activeHashtag={activeHashtag} onSelectHashtag={onSelectHashtag} />
      )}

      {showNewPostForm && (
        <CreatePostForm
          content={newPostContent}
          token={token}
          postLimits={postLimits}
          seedPreview={postSeedPreview}
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
              : feedMode === 'bookmarks'
                ? 'No saved posts yet. Bookmark posts to find them here.'
                : feedMode === 'explore'
                  ? activeHashtag
                    ? `No posts found for #${activeHashtag} yet.`
                    : 'Pick a trending hashtag to explore posts.'
                  : 'No posts yet. Be the first to publish!'}
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                gamificationEnabled={gamificationEnabled}
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
                onViewHashtag={onViewHashtag}
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
                onOpenPost={onOpenPost}
                onOpenOlabidItem={onOpenOlabidItem}
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
    </div>
  );
}
