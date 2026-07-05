import { z } from 'zod';

export type FollowStatus = 'none' | 'following' | 'requested' | 'follows_you';

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  postCount?: number | null;
  isPrivate?: boolean;
  followerCount?: number;
  followingCount?: number;
  followStatus?: FollowStatus;
  canViewPosts?: boolean;
}

export interface FollowRequest {
  requesterId: number;
  requesterUsername: string;
  requesterAvatarUrl?: string | null;
  createdAt: string;
}

export interface FollowListUser {
  id: number;
  username: string;
  avatarUrl?: string | null;
  followStatus?: FollowStatus;
}

export interface FollowListPage {
  users: FollowListUser[];
  nextCursor: number | null;
}

export type PostType = 'text' | 'poll';
export type PostVisibility = 'public' | 'followers' | 'only_me';
export type PollResultsVisibility = 'always' | 'after_vote' | 'after_close';
export type PollStatus = 'open' | 'closed';

export interface PollOption {
  id: number;
  label: string;
  position: number;
  voteCount: number;
  votePercent?: number;
}

export interface Poll {
  id: number;
  postId: number;
  question: string;
  endsAt: string | null;
  maxSelections: number;
  allowVoteChange: boolean;
  allowVoteRetraction: boolean;
  isAnonymous: boolean;
  resultsVisibility: PollResultsVisibility;
  status: PollStatus;
  totalVotes: number;
  options: PollOption[];
  userVoteOptionIds?: number[];
  showResults: boolean;
  isExpired: boolean;
}

export interface Post {
  id: number;
  userId: number;
  username: string;
  type: PostType;
  content: string;
  mediaUrls: string[];
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  hasLiked?: boolean;
  deletedAt?: string | null;
  visibility?: PostVisibility;
  poll?: Poll;
}

export interface MediaUpload {
  id: number;
  userId: number;
  r2Key: string;
  url: string;
  type: 'avatar' | 'cover' | 'post';
  postId: number | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Comment {
  id: number;
  postId: number;
  userId: number;
  username: string;
  content: string;
  parentId: number | null; // For nesting comment replies
  createdAt: string;
  deletedAt?: string | null;
  likesCount: number;
  hasLiked?: boolean;
}

export interface Message {
  id: number;
  senderId: number;
  senderUsername: string;
  receiverId: number;
  receiverUsername: string;
  content: string;
  createdAt: string;
  read: boolean;
  deletedAt?: string | null;
}

export interface ChatThread {
  id: number;
  username: string;
  role: string;
  lastMessage: {
    content: string;
    senderId: number;
    createdAt: string;
    read: boolean;
  } | null;
  unreadCount: number;
}

export interface Notification {
  id: number;
  userId: number;
  senderId: number;
  senderUsername: string;
  type: 'like' | 'comment' | 'message' | 'mention' | 'system' | 'follow' | 'follow_request' | 'follow_accepted';
  /** What entityId points at. Optional for older rows written before migration. */
  entityType?: 'post' | 'message' | 'system' | 'user' | null;
  entityId: number; // postId for likes/comments/mentions, messageId for messages, system_broadcasts.id for system
  /** Set for comment / mention-in-comment notifications. Optional for older rows. */
  commentId?: number | null;
  content: string;
  read: boolean;
  createdAt: string;
}

export type BroadcastDelivery = 'notification' | 'toast' | 'both';

export interface SystemBroadcast {
  id: number;
  senderId: number;
  senderUsername: string;
  content: string;
  delivery: BroadcastDelivery;
  notificationsCreated: number;
  createdAt: string;
}

export interface PostsPage {
  posts: Post[];
  nextCursor: number | null;
}

/** Resolve post deep-link target from a notification (handles legacy rows missing entityType). */
export function notificationPostTarget(
  n: Notification,
): { postId: number; commentId?: number } | null {
  if (n.type === 'like' || n.type === 'comment' || n.type === 'mention') {
    if (n.entityType && n.entityType !== 'post') return null;
    return {
      postId: n.entityId,
      commentId: n.commentId ?? undefined,
    };
  }
  return null;
}

// Zod schemas for input validation
export const PollOptionInputSchema = z.object({
  label: z.string().min(1, 'Option cannot be empty').max(200, 'Option is too long'),
});

export const CreateTextPostSchema = z.object({
  type: z.literal('text').optional(),
  content: z.string().min(1, 'Post content cannot be empty').max(1000, 'Post is too long'),
  mediaUrls: z.array(z.string().url()).max(5, 'Maximum 5 images allowed').optional(),
  visibility: z.enum(['public', 'followers', 'only_me']).optional().default('public'),
});

export const CreatePollPostSchema = z.object({
  type: z.literal('poll'),
  content: z.string().max(1000, 'Post is too long').optional().default(''),
  question: z.string().min(1, 'Poll question cannot be empty').max(500, 'Poll question is too long'),
  options: z.array(PollOptionInputSchema).min(2, 'At least 2 options required').max(10, 'Maximum 10 options allowed'),
  maxSelections: z.number().int().min(1).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  allowVoteChange: z.boolean().optional().default(true),
  allowVoteRetraction: z.boolean().optional().default(true),
  isAnonymous: z.boolean().optional().default(false),
  resultsVisibility: z.enum(['always', 'after_vote', 'after_close']).optional().default('always'),
  mediaUrls: z.array(z.string().url()).max(5, 'Maximum 5 images allowed').optional(),
  visibility: z.enum(['public', 'followers', 'only_me']).optional().default('public'),
}).superRefine((data, ctx) => {
  const maxSel = data.maxSelections ?? 1;
  if (maxSel > data.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maxSelections cannot exceed number of options',
      path: ['maxSelections'],
    });
  }
});

/** Parse create-post body; defaults missing type to text post */
export function parseCreatePostBody(body: unknown) {
  const raw = body as Record<string, unknown>;
  if (raw?.type === 'poll') {
    return CreatePollPostSchema.safeParse(body);
  }
  return CreateTextPostSchema.safeParse(body);
}

export const VotePollSchema = z.object({
  optionIds: z.array(z.number().int().positive()).min(1, 'Select at least one option'),
});

export const CreateCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(500, 'Comment is too long'),
  parentId: z.number().nullable().optional(),
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

export const UpdateProfileSchema = z.object({
  bio: z.string().max(500, 'Bio is too long').nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

// WebSocket Message Types
export type ClientMessage =
  | { type: 'join'; payload: { token: string } }
  | { type: 'active_chat'; payload: { recipientId: number | null } }
  | { type: 'send_message'; payload: { receiverId: number; content: string } }
  | { type: 'typing'; payload: { receiverId: number; isTyping: boolean } };

export type ServerMessage =
  | { type: 'joined'; payload: { userId: number } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'message'; payload: Message }
  | { type: 'notification'; payload: Notification }
  | { type: 'post_created'; payload: { post: Post } }
  | { type: 'post_deleted'; payload: { postId: number } }
  | { type: 'like_update'; payload: { postId: number; likesCount: number; userId: number; liked: boolean } }
  | { type: 'comment_like_update'; payload: { commentId: number; postId: number; likesCount: number; userId: number; liked: boolean } }
  | { type: 'comment_created'; payload: { comment: Comment } }
  | { type: 'comment_deleted'; payload: { commentId: number; postId: number } }
  | { type: 'post_updated'; payload: { post: Post } }
  | { type: 'comment_updated'; payload: { comment: Comment } }
  | { type: 'poll_vote_update'; payload: { postId: number; poll: Poll } }
  | { type: 'poll_closed'; payload: { postId: number; poll: Poll } }
  | { type: 'typing'; payload: { senderId: number; isTyping: boolean } }
  | { type: 'messages_read'; payload: { senderId: number; receiverId: number } }
  | { type: 'presence_snapshot'; payload: { onlineUserIds: number[] } }
  | { type: 'user_online'; payload: { userId: number } }
  | { type: 'user_offline'; payload: { userId: number } }
  | { type: 'system_toast'; payload: { content: string } };

export const BroadcastSystemMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(500, 'Message is too long'),
  delivery: z.enum(['notification', 'toast', 'both']),
});
