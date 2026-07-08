import { z } from 'zod';

export type FollowStatus = 'none' | 'following' | 'requested' | 'follows_you';

export type BlockStatus = 'none' | 'you_blocked' | 'blocked_you';
export type MuteStatus = 'none' | 'muted';
export type DeletionSource = 'self' | 'admin';
export type AccountStatus = 'active' | 'self_deleted' | 'admin_deleted';

export interface User {
  id: number;
  username: string;
  role: 'user' | 'admin';
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  country?: string | null;
  deletionSource?: DeletionSource | null;
  accountStatus?: AccountStatus;
  postCount?: number | null;
  isPrivate?: boolean;
  followerCount?: number;
  followingCount?: number;
  followStatus?: FollowStatus;
  canViewPosts?: boolean;
  blockStatus?: BlockStatus;
  muteStatus?: MuteStatus;
  equippedBadges?: EquippedBadgePublic[];
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

export interface BlockListUser {
  id: number;
  username: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface MuteListUser {
  id: number;
  username: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface BlockListPage {
  users: BlockListUser[];
  nextCursor: number | null;
}

export interface MuteListPage {
  users: MuteListUser[];
  nextCursor: number | null;
}

export type ReportTargetType = 'user' | 'post' | 'comment';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'misinformation' | 'nudity' | 'other';
export type ReportStatus = 'pending' | 'dismissed' | 'action_taken';
export type ReviewReportAction = 'dismiss' | 'delete_content' | 'delete_user';

export interface ContentReport {
  id: number;
  reporterId: number;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: number;
  reason: ReportReason;
  details?: string | null;
  status: ReportStatus;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  createdAt: string;
  targetPreview?: string | null;
  targetUsername?: string | null;
}

export interface ReportListPage {
  reports: ContentReport[];
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

export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
}

export interface Post {
  id: number;
  userId: number;
  username: string;
  authorAvatarUrl?: string | null;
  authorRole?: string;
  authorEquippedBadges?: EquippedBadgePublic[];
  type: PostType;
  content: string;
  mediaUrls: string[];
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  hasLiked?: boolean;
  hasBookmarked?: boolean;
  bookmarksCount?: number;
  sharesCount?: number;
  deletedAt?: string | null;
  visibility?: PostVisibility;
  poll?: Poll;
  pinnedAt?: string | null;
  threadRootId?: number | null;
  parentPostId?: number | null;
  threadReplyCount?: number;
  threadPosts?: Post[];
  linkPreview?: LinkPreview | null;
}

export interface TrendingHashtag {
  tag: string;
  count: number;
}

export interface TrendingHashtagsPage {
  hashtags: TrendingHashtag[];
}

export interface PostThreadPage {
  root: Post;
  replies: Post[];
}

export interface SearchResults {
  users: User[];
  posts: Post[];
  hashtags: TrendingHashtag[];
  mentions: Post[];
  hasMore: boolean;
}

/** Hard caps for admin-configurable system settings. */
export const SYSTEM_SETTING_BOUNDS = {
  maxPinnedPostsPerUser: { min: 0, max: 10 },
  maxPostLength: { min: 100, max: 10000 },
  maxMediaPerPost: { min: 0, max: 20 },
} as const;

/** Absolute upper bounds used by request-schema validation (≥ any admin limit). */
export const ABSOLUTE_MAX_POST_LENGTH = SYSTEM_SETTING_BOUNDS.maxPostLength.max;
export const ABSOLUTE_MAX_MEDIA_PER_POST = SYSTEM_SETTING_BOUNDS.maxMediaPerPost.max;

export interface SystemSettings {
  maxPinnedPostsPerUser: number;
  maxPostLength: number;
  maxMediaPerPost: number;
}

export interface MeBootstrapCounts {
  unreadNotifications: number;
  unreadMessages: number;
  pendingFollowRequests: number;
}

export interface MeBootstrap {
  followingIds: number[];
  blockedIds: number[];
  mutedIds: number[];
  userSettings: UserSettings;
  systemSettings: SystemSettings;
  counts: MeBootstrapCounts;
  /** True when the user has finished the first-run intro walkthrough. */
  introWalkthroughCompleted: boolean;
  gamificationEnabled?: boolean;
  /** Present when user has gamification data to display (read-only when flag is OFF). */
  g?: GamificationPublic;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  maxPinnedPostsPerUser: 1,
  maxPostLength: 1000,
  maxMediaPerPost: 5,
};

export function validatePostLimits(
  content: string,
  mediaCount: number,
  limits: Pick<SystemSettings, 'maxPostLength' | 'maxMediaPerPost'>,
): string | null {
  if (content.length > limits.maxPostLength) {
    return `Post is too long (max ${limits.maxPostLength} characters)`;
  }
  if (mediaCount > limits.maxMediaPerPost) {
    const label = limits.maxMediaPerPost === 1 ? 'image' : 'images';
    return `Maximum ${limits.maxMediaPerPost} ${label} allowed`;
  }
  return null;
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
  authorEquippedBadges?: EquippedBadgePublic[];
  /** Gamification delta from this action (comment create). */
  g?: GamificationActionBlock;
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
  avatarUrl?: string | null;
  equippedBadges?: EquippedBadgePublic[];
  lastMessage: {
    content: string;
    senderId: number;
    createdAt: string;
    read: boolean;
  } | null;
  unreadCount: number;
}

export type NotificationCategory = 'social' | 'gamification';

export interface Notification {
  id: number;
  userId: number;
  senderId: number;
  senderUsername: string;
  type: 'like' | 'comment' | 'message' | 'mention' | 'system' | 'follow' | 'follow_request' | 'follow_accepted' | 'badge_award' | 'level_up' | 'event_win';
  /** What entityId points at. Optional for older rows written before migration. */
  entityType?: 'post' | 'message' | 'system' | 'user' | 'badge' | 'event' | null;
  entityId: number; // postId for likes/comments/mentions, messageId for messages, system_broadcasts.id for system
  /** Set for comment / mention-in-comment notifications. Optional for older rows. */
  commentId?: number | null;
  content: string;
  /** Inbox tab: social (default) or gamification (System tab when gamification is enabled). */
  category?: NotificationCategory;
  read: boolean;
  createdAt: string;
}

/** True for badge, level-up, and event-win notifications (System tab). */
export function isGamificationNotification(
  n: Pick<Notification, 'category' | 'type'>,
): boolean {
  if (n.category === 'gamification') return true;
  return n.type === 'badge_award' || n.type === 'level_up' || n.type === 'event_win';
}

export function resolveNotificationCategory(
  n: Pick<Notification, 'category' | 'type'>,
): NotificationCategory {
  return isGamificationNotification(n) ? 'gamification' : 'social';
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
  nextCursor: number | string | null;
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
  content: z.string().min(1, 'Post content cannot be empty').max(ABSOLUTE_MAX_POST_LENGTH, 'Post is too long'),
  mediaUrls: z.array(z.string().url()).max(ABSOLUTE_MAX_MEDIA_PER_POST, 'Too many images').optional(),
  visibility: z.enum(['public', 'followers', 'only_me']).optional().default('public'),
  replyToPostId: z.number().int().positive().optional(),
});

export const CreatePollPostSchema = z.object({
  type: z.literal('poll'),
  content: z.string().max(ABSOLUTE_MAX_POST_LENGTH, 'Post is too long').optional().default(''),
  question: z.string().min(1, 'Poll question cannot be empty').max(500, 'Poll question is too long'),
  options: z.array(PollOptionInputSchema).min(2, 'At least 2 options required').max(10, 'Maximum 10 options allowed'),
  maxSelections: z.number().int().min(1).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  allowVoteChange: z.boolean().optional().default(true),
  allowVoteRetraction: z.boolean().optional().default(true),
  isAnonymous: z.boolean().optional().default(false),
  resultsVisibility: z.enum(['always', 'after_vote', 'after_close']).optional().default('always'),
  mediaUrls: z.array(z.string().url()).max(ABSOLUTE_MAX_MEDIA_PER_POST, 'Too many images').optional(),
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
});

export type ChatIconMode = 'global' | 'selected_pages';
export type ChatIconPage = 'feed' | 'profile' | 'post';

export type NotificationPrefType = 'like' | 'comment' | 'mention' | 'message' | 'system';

export interface UserSettings {
  isPrivate: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  notifyMentions: boolean;
  notifyDms: boolean;
  notifySystem: boolean;
  muteAllToasts: boolean;
  chatIconMode: ChatIconMode;
  chatIconPages: ChatIconPage[];
  updatedAt: string;
}

export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'isPrivate' | 'updatedAt'> = {
  notifyLikes: true,
  notifyComments: true,
  notifyMentions: true,
  notifyDms: true,
  notifySystem: true,
  muteAllToasts: false,
  chatIconMode: 'global',
  chatIconPages: [],
};

export const UpdateUserSettingsSchema = z.object({
  isPrivate: z.boolean().optional(),
  notifyLikes: z.boolean().optional(),
  notifyComments: z.boolean().optional(),
  notifyMentions: z.boolean().optional(),
  notifyDms: z.boolean().optional(),
  notifySystem: z.boolean().optional(),
  muteAllToasts: z.boolean().optional(),
  chatIconMode: z.enum(['global', 'selected_pages']).optional(),
  chatIconPages: z.array(z.enum(['feed', 'profile', 'post'])).optional(),
});

/** Maps notification type to the corresponding user settings field. Follow types are always enabled. */
export function isNotificationEnabledForSettings(
  settings: UserSettings,
  type: Notification['type'],
): boolean {
  switch (type) {
    case 'like':
      return settings.notifyLikes;
    case 'comment':
      return settings.notifyComments;
    case 'mention':
      return settings.notifyMentions;
    case 'message':
      return settings.notifyDms;
    case 'system':
      return settings.notifySystem;
    case 'badge_award':
    case 'level_up':
    case 'event_win':
      return true;
    default:
      return true;
  }
}

export function shouldShowNotificationToast(
  settings: UserSettings,
  type: Notification['type'] | 'system',
): boolean {
  if (settings.muteAllToasts) return false;
  if (type === 'system') return settings.notifySystem;
  return isNotificationEnabledForSettings(settings, type);
}

export function shouldShowChatIcon(
  settings: UserSettings,
  activeTab: ChatIconPage | 'admin',
): boolean {
  if (activeTab === 'admin') return false;
  if (settings.chatIconMode === 'global') return true;
  return settings.chatIconPages.includes(activeTab);
}

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

export const CreateReportSchema = z.object({
  targetType: z.enum(['user', 'post', 'comment']),
  targetId: z.number().int().positive(),
  reason: z.enum(['spam', 'harassment', 'hate', 'misinformation', 'nudity', 'other']),
  details: z.string().max(500, 'Details are too long').optional(),
});

export const ReviewReportSchema = z.object({
  action: z.enum(['dismiss', 'delete_content', 'delete_user']),
});

export const DeleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const UpdateSystemSettingsSchema = z.object({
  maxPinnedPostsPerUser: z.number().int().min(SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.min).max(SYSTEM_SETTING_BOUNDS.maxPinnedPostsPerUser.max).optional(),
  maxPostLength: z.number().int().min(SYSTEM_SETTING_BOUNDS.maxPostLength.min).max(SYSTEM_SETTING_BOUNDS.maxPostLength.max).optional(),
  maxMediaPerPost: z.number().int().min(SYSTEM_SETTING_BOUNDS.maxMediaPerPost.min).max(SYSTEM_SETTING_BOUNDS.maxMediaPerPost.max).optional(),
}).refine(
  data => data.maxPinnedPostsPerUser !== undefined
    || data.maxPostLength !== undefined
    || data.maxMediaPerPost !== undefined,
  { message: 'At least one setting must be provided' },
);

// --- Platform Reviver (gamification) ---

export type MetricType = 'instant' | 'cumulative' | 'streak' | 'duration';

export type GamificationActionType =
  | 'post_created'
  | 'post_deleted'
  | 'post_shared'
  | 'post_unshared'
  | 'comment_created'
  | 'comment_deleted'
  | 'user_followed'
  | 'user_unfollowed'
  | 'post_liked'
  | 'post_unliked'
  | 'like_given'
  | 'like_removed'
  | 'session_active'
  | 'session_tick';

/**
 * Minimal client-facing gamification DTO — no rules or metric keys.
 * `level`, `totalPoints`, and `pointsToNextLevel` are omitted entirely when the
 * admin hides them globally (they still accrue in the background).
 */
export interface GamificationPublic {
  level?: number;
  totalPoints?: number;
  pointsToNextLevel?: number | null;
  badges: GamificationPublicBadge[];
  goalsInProgress: GamificationPublicGoal[];
  equippedBadges: EquippedBadgePublic[];
  /** Max badges this user may equip at once. `null` means unlimited (admins). */
  maxEquippedBadges: number | null;
}

export interface GamificationPublicBadge {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  earnedAt: string;
}

/** Minimal badge info for inline display next to a username. */
export interface EquippedBadgePublic {
  id: number;
  name: string;
  imageUrl: string | null;
}

export interface GamificationPublicGoal {
  badgeId: number;
  name: string;
  description: string;
  current: number;
  target: number;
}

/** Server-only gamification state — never sent to the web client. */
export interface GamificationInternal {
  userId: number;
  totalPoints: number;
  level: number;
  counters: Record<string, number>;
  earnedBadgeIds: number[];
}

export interface GamificationSettings {
  gamificationEnabled: boolean;
  /** When false, users' global level is hidden everywhere in the UI and stripped from API responses. */
  showLevel: boolean;
  /** When false, users' global points are hidden everywhere in the UI and stripped from API responses. */
  showPoints: boolean;
}

export const UpdateGamificationSettingsSchema = z
  .object({
    gamificationEnabled: z.boolean().optional(),
    showLevel: z.boolean().optional(),
    showPoints: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.gamificationEnabled !== undefined ||
      data.showLevel !== undefined ||
      data.showPoints !== undefined,
    { message: 'At least one setting must be provided' },
  );

/** Requires the admin to type the literal phrase "RESET" to confirm a destructive, irreversible reset. */
export const ResetGamificationProgressSchema = z.object({
  confirm: z.literal('RESET'),
});

export interface ResetGamificationProgressResult {
  success: true;
  usersAffected: number;
}

export interface MetricCatalogEntry {
  key: string;
  label: string;
  description: string;
  type: MetricType;
  actions: GamificationActionType[];
}

export interface MetricCatalogResponse {
  metrics: MetricCatalogEntry[];
}

export interface BadgeRuleDefinition {
  badgeId: number;
  metricKey: string;
  operator: string;
  threshold: number;
}

/** Result returned from processUserAction after a rewarded action. */
export interface GamificationActionResult {
  skipped: boolean;
  pointsEarned: number;
  totalPoints: number;
  level: number;
  levelUp: number | null;
  badgesEarned: number[];
  eventWins?: number[];
}

/**
 * Minimal gamification block for action responses (share, post create).
 * `pe`/`pt` are omitted when points are hidden globally, `lv` when the level is
 * hidden — the values are still computed server-side.
 */
export interface GamificationActionBlock {
  pe?: number;
  pt?: number;
  lv?: number;
  be?: number[];
}

export interface AdminBadge {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  deletedAt: string | null;
  rule: BadgeRuleDefinition | null;
}

export interface PointRule {
  actionType: GamificationActionType;
  points: number;
  isActive: boolean;
}

export interface LevelConfigEntry {
  level: number;
  minPoints: number;
  maxEquippedBadges: number;
}

export const CreateBadgeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().default(''),
  imageUrl: z.string().url().nullable().optional(),
  metricKey: z.string().min(1, 'Metric is required'),
  operator: z.enum(['>=', '>', '=', '==', '<=', '<']).optional().default('>='),
  threshold: z.number().int().min(1, 'Threshold must be at least 1'),
});

export const UpdateBadgeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  metricKey: z.string().min(1).optional(),
  operator: z.enum(['>=', '>', '=', '==', '<=', '<']).optional(),
  threshold: z.number().int().min(1).optional(),
});

export const UpdatePointRulesSchema = z.object({
  rules: z.array(z.object({
    actionType: z.string().min(1),
    points: z.number().int().min(0),
    isActive: z.boolean().optional(),
  })).min(1),
});

export const UpdateLevelConfigSchema = z.object({
  levels: z.array(z.object({
    level: z.number().int().min(1),
    minPoints: z.number().int().min(0),
    maxEquippedBadges: z.number().int().min(0),
  })).min(1),
});

export const UpdateEquippedBadgesSchema = z.object({
  badgeIds: z.array(z.number().int().positive()),
});

// --- Events (v3) ---

export type EventStatus = 'draft' | 'active' | 'ended';
export type EventWinType = 'leaderboard' | 'first_to_n' | 'threshold' | 'raffle';
export type EventPrizeType = 'badge' | 'points' | 'title';

export interface EventRuleConfig {
  topN?: number;
  count?: number;
  threshold?: number;
  prizeType: EventPrizeType;
  prizeRef?: string;
}

export interface PublicEvent {
  id: number;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  bannerUrl: string | null;
  requiresOptIn: boolean;
  joined?: boolean;
  myScore?: number;
  rules: PublicEventRule[];
}

export interface PublicEventRule {
  metricKey: string;
  winType: EventWinType;
}

export interface EventLeaderboardEntry {
  userId: number;
  username: string;
  score: number;
  rank: number;
  equippedBadges?: EquippedBadgePublic[];
}

export interface EventLeaderboard {
  eventId: number;
  entries: EventLeaderboardEntry[];
  myRank: number | null;
  myScore: number | null;
}

export interface AdminEvent {
  id: number;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  bannerUrl: string | null;
  requiresOptIn: boolean;
  createdAt: string;
  rules: AdminEventRule[];
}

export interface AdminEventRule {
  id?: number;
  metricKey: string;
  winType: EventWinType;
  config: EventRuleConfig;
}

export const CreateEventSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().min(1, 'Description is required').max(1000),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  status: z.enum(['draft', 'active', 'ended']).optional().default('draft'),
  bannerUrl: z.string().url().nullable().optional(),
  requiresOptIn: z.boolean().optional().default(true),
  rules: z.array(z.object({
    metricKey: z.string().min(1),
    winType: z.enum(['leaderboard', 'first_to_n', 'threshold', 'raffle']),
    config: z.object({
      topN: z.number().int().min(1).optional(),
      count: z.number().int().min(1).optional(),
      threshold: z.number().int().min(1).optional(),
      prizeType: z.enum(['badge', 'points', 'title']),
      prizeRef: z.string().optional(),
    }),
  })).min(1),
});

export const UpdateEventSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  description: z.string().min(1, 'Description is required').max(1000).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  status: z.enum(['draft', 'active', 'ended']).optional(),
  bannerUrl: z.string().url().nullable().optional(),
  requiresOptIn: z.boolean().optional(),
  rules: z.array(z.object({
    metricKey: z.string().min(1),
    winType: z.enum(['leaderboard', 'first_to_n', 'threshold', 'raffle']),
    config: z.object({
      topN: z.number().int().min(1).optional(),
      count: z.number().int().min(1).optional(),
      threshold: z.number().int().min(1).optional(),
      prizeType: z.enum(['badge', 'points', 'title']),
      prizeRef: z.string().optional(),
    }),
  })).optional(),
});

/** WebSocket payload for instant gamification feedback (secondary path). */
export interface GamificationRewardPayload {
  pe?: number;
  pt?: number;
  lv?: number;
  be?: number[];
  levelUp?: number | null;
  eventWin?: { eventId: number; eventName: string };
}

/** Admin support view — counters use catalog labels, no rule leakage. */
export interface AdminUserGamificationCounter {
  label: string;
  value: number;
}

export interface AdminUserGamificationBadge {
  id: number;
  name: string;
  imageUrl: string | null;
  earnedAt: string;
}

export interface AdminUserGamificationLedgerEntry {
  actionType: string;
  delta: number;
  createdAt: string;
}

export interface AdminUserGamification {
  userId: number;
  username: string;
  level: number;
  totalPoints: number;
  counters: AdminUserGamificationCounter[];
  badges: AdminUserGamificationBadge[];
  recentLedger: AdminUserGamificationLedgerEntry[];
}

export const AdminAwardBadgeSchema = z.object({
  badgeId: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'login'
  | 'register'
  | 'logout'
  | 'failed_login'
  | 'password_change'
  | 'account_delete'
  | 'admin_impersonate'
  | 'role_change';

export type AuditDeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';

/** Full audit log row — returned to admins only. */
export interface AuditLog {
  id: number;
  userId: number | null;
  username: string | null;       // joined from users
  eventType: AuditEventType;
  success: boolean;
  failureReason: string | null;
  // Network
  ipAddress: string | null;
  // Geo
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  // Device
  userAgent: string | null;
  deviceType: AuditDeviceType | null;
  os: string | null;
  browser: string | null;
  // Session
  clientLocalTime: string | null;
  sessionId: string | null;
  // Admin
  targetUserId: number | null;
  targetUsername: string | null;  // joined from users
  // Lifecycle
  createdAt: string;
}

/** Partial row shown to users viewing their own login history. */
export interface AuditLogPartial {
  id: number;
  eventType: AuditEventType;
  success: boolean;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: AuditDeviceType | null;
  os: string | null;
  browser: string | null;
  clientLocalTime: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  logs: AuditLog[];
  nextCursor: number | null;
}

export interface AuditLogPartialPage {
  logs: AuditLogPartial[];
  nextCursor: number | null;
}

