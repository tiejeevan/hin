import { z } from 'zod';

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface Post {
  id: number;
  userId: number;
  username: string;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  hasLiked?: boolean;
}

export interface Comment {
  id: number;
  postId: number;
  userId: number;
  username: string;
  content: string;
  createdAt: string;
}

export interface Message {
  id: number;
  senderId: number;
  senderUsername: string;
  receiverId: number;
  receiverUsername: string;
  content: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  senderId: number;
  senderUsername: string;
  type: 'like' | 'comment' | 'message';
  entityId: number; // postId for likes/comments, messageId for messages
  content: string;
  read: boolean;
  createdAt: string;
}

// Zod schemas for input validation
export const CreatePostSchema = z.object({
  content: z.string().min(1, 'Post content cannot be empty').max(1000, 'Post is too long'),
  mediaUrl: z.string().url().nullable().optional(),
});

export const CreateCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(500, 'Comment is too long'),
});

export const CreateMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message is too long'),
});

export const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username is too long'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(50, 'Password is too long'),
});

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// WebSocket Message Types
export type ClientMessage =
  | { type: 'join'; payload: { userId: number; username: string } }
  | { type: 'send_message'; payload: { receiverId: number; content: string } };

export type ServerMessage =
  | { type: 'message'; payload: Message }
  | { type: 'notification'; payload: Notification }
  | { type: 'online_users'; payload: { userIds: number[] } };
