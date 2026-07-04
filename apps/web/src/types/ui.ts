import { Comment, User as UserType } from '@hin/types';

export interface Toast {
  id: string;
  content: string;
  type: 'like' | 'comment' | 'message' | 'mention' | 'system';
}

export interface AdminData {
  stats: {
    users: number;
    posts: number;
    comments: number;
    messages: number;
  };
  users: UserType[];
}

export interface CommentNode extends Comment {
  replies: CommentNode[];
}

export type ActiveTab = 'feed' | 'admin' | 'profile';

export interface ChatRecipient {
  id: number;
  username: string;
  role: string;
}
