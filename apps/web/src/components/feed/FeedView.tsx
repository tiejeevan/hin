import { Plus } from 'lucide-react';
import { Post, Comment, User as UserType, ChatThread, Message } from '@hin/types';
import { CommentNode, ChatRecipient } from '../../types/ui';
import { CreatePostForm } from './CreatePostForm';
import { PostCard } from './PostCard';
import { FloatingActionStack } from '../ui/FloatingActionStack';

interface FeedViewProps {
  posts: Post[];
  users: UserType[];
  currentUser: UserType;
  threads: ChatThread[];
  showNewPostForm: boolean;
  showMessagesDropdown: boolean;
  messagesPanelExpanded: boolean;
  typingUsers: Record<number, boolean>;
  unreadMessagesCount: number;
  messageIconPulseAt: number;
  chatRecipient: ChatRecipient | null;
  chatMessages: Message[];
  newMsgText: string;
  chatBottomRef: React.RefObject<HTMLDivElement>;
  hasBottomNav: boolean;
  newPostContent: string;
  newPostMedia: string;
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
  onCloseMessages: () => void;
  onToggleMessagesExpand: () => void;
  onSelectThread: (thread: ChatRecipient) => void;
  onBackToList: () => void;
  onNewMsgTextChange: (text: string) => void;
  onSendDM: (e: React.FormEvent) => void;
  onTyping: (recipientId: number) => void;
  onNewPostContentChange: (value: string) => void;
  onNewPostMediaChange: (value: string) => void;
  onCreatePost: (e: React.FormEvent) => void;
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
  onStartChat: (user: UserType) => void;
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
  threads,
  showNewPostForm,
  showMessagesDropdown,
  messagesPanelExpanded,
  typingUsers,
  unreadMessagesCount,
  messageIconPulseAt,
  chatRecipient,
  chatMessages,
  newMsgText,
  chatBottomRef,
  hasBottomNav,
  newPostContent,
  newPostMedia,
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
  onCloseMessages,
  onToggleMessagesExpand,
  onSelectThread,
  onBackToList,
  onNewMsgTextChange,
  onSendDM,
  onTyping,
  onNewPostContentChange,
  onNewPostMediaChange,
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
  onStartChat,
  onDeleteComment,
  onStartCommentEdit,
  onCancelCommentEdit,
  onSaveCommentEdit,
  onEditCommentContentChange,
  onReply,
}: FeedViewProps) {
  const bottomPad = hasBottomNav ? 'pb-24' : 'pb-20';

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
          mediaUrl={newPostMedia}
          onContentChange={onNewPostContentChange}
          onMediaChange={onNewPostMediaChange}
          onSubmit={onCreatePost}
          onClose={onCloseCreatePost}
        />
      )}

      <div className={`space-y-4 ${bottomPad} md:pb-4`}>
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
              onStartChat={onStartChat}
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
        messagesPanelExpanded={messagesPanelExpanded}
        threads={threads}
        currentUser={currentUser}
        chatRecipient={chatRecipient}
        chatMessages={chatMessages}
        newMsgText={newMsgText}
        typingUsers={typingUsers}
        unreadMessagesCount={unreadMessagesCount}
        messageIconPulseAt={messageIconPulseAt}
        chatBottomRef={chatBottomRef}
        hasBottomNav={hasBottomNav}
        onOpenCreatePost={onOpenCreatePost}
        onToggleMessages={onToggleMessages}
        onCloseMessages={onCloseMessages}
        onToggleMessagesExpand={onToggleMessagesExpand}
        onSelectThread={onSelectThread}
        onBackToList={onBackToList}
        onNewMsgTextChange={onNewMsgTextChange}
        onSendDM={onSendDM}
        onTyping={onTyping}
      />
    </div>
  );
}
