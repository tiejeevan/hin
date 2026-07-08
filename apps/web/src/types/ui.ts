import { Comment, User as UserType } from '@hin/types';

export interface Toast {
  id: string;
  content: string;
  type: 'like' | 'comment' | 'message' | 'mention' | 'system' | 'follow' | 'follow_request' | 'follow_accepted' | 'badge_award' | 'level_up';
  postId?: number;
  commentId?: number;
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

export type FeedMode = 'all' | 'following' | 'bookmarks' | 'explore' | 'search';

export type ActiveTab = 'feed' | 'admin' | 'profile' | 'post';

export interface ChatRecipient {
  id: number;
  username: string;
  role: string;
  avatarUrl?: string | null;
}
