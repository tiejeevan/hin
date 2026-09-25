import { Comment, ItemComment, User as UserType } from '@hin/types';

export interface Toast {
  id: string;
  content: string;
  type: 'like' | 'comment' | 'message' | 'mention' | 'system' | 'follow' | 'follow_request' | 'follow_accepted' | 'badge_award' | 'level_up';
  duration: number;
  postId?: number;
  commentId?: number;
  olabidItemId?: number;
  /** When set, tapping the toast invokes the registered retry handler. */
  retryKey?: string;
}

export interface AdminData {
  stats: {
    users: number;
    deletedUsers?: number;
    posts: number;
    comments: number;
    messages: number;
  };
  users: UserType[];
}

export interface CommentNode extends Comment {
  replies: CommentNode[];
}

export interface ItemCommentNode extends ItemComment {
  replies: ItemCommentNode[];
}

export type FeedMode = 'all' | 'following' | 'bookmarks' | 'explore' | 'search';

export type ActiveTab = 'feed' | 'admin' | 'moderator' | 'profile' | 'post' | 'olabid' | 'welcome' | 'contact';

export interface ChatRecipient {
  id: number;
  username: string;
  role: string;
  avatarUrl?: string | null;
}
