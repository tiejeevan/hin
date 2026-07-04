import { Plus } from 'lucide-react';
import { Post, Comment, User as UserType } from '@hin/types';
import { CommentNode } from '../../types/ui';
import { CreatePostForm } from './CreatePostForm';
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
  onOpenCreatePost: () => void;
  onCloseCreatePost: () => void;
  onToggleMessages: () => void;
  onNewPostContentChange: (value: string) => void;
  onCreatePost: (e: React.FormEvent, mediaUrls: string[]) => void | Promise<void>;
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
}: FeedViewProps) {
  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4 relative">
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

      <div className="space-y-4 pb-20 md:pb-4">
        {posts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border-custom rounded-2xl text-text-muted text-sm">
            No posts yet. Be the first to publish!
          </div>
        ) : (
          posts.map(post => (
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
            />
          ))
        )}
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
