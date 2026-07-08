import { sqliteTable, integer, text, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').default('').notNull(),
  role: text('role').default('user').notNull(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  coverUrl: text('cover_url'),
  /** 0 = public, 1 = private (follow approval required) */
  isPrivate: integer('is_private').default(0).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete for users
  /** 'self' | 'admin' when deleted_at is set */
  deletionSource: text('deletion_source'),
  country: text('country'),
  googleId: text('google_id'),
}, (table) => ({
  deletedAtIdx: index('users_deleted_at_idx').on(table.deletedAt),
  isPrivateIdx: index('users_is_private_idx').on(table.isPrivate),
  googleIdIdx: uniqueIndex('users_google_id_idx').on(table.googleId),
}));

/** One row per user once they finish the first-run intro walkthrough. */
export const introWalkthrough = sqliteTable('intro_walkthrough', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  completedAt: text('completed_at').notNull(),
  /** Bump when tour content changes so clients can re-show a new version. */
  version: integer('version').default(1).notNull(),
});

export const userSettings = sqliteTable('user_settings', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  notifyLikes: integer('notify_likes').default(1).notNull(),
  notifyComments: integer('notify_comments').default(1).notNull(),
  notifyMentions: integer('notify_mentions').default(1).notNull(),
  notifyDms: integer('notify_dms').default(1).notNull(),
  notifySystem: integer('notify_system').default(1).notNull(),
  muteAllToasts: integer('mute_all_toasts').default(0).notNull(),
  /** 'global' | 'selected_pages' */
  chatIconMode: text('chat_icon_mode').default('global').notNull(),
  /** JSON array of page keys: feed, profile, post */
  chatIconPages: text('chat_icon_pages').default('[]').notNull(),
  extensionsJson: text('extensions_json').default('{}').notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Cached Open Graph metadata for a URL shared in a post (keyed by normalized URL hash). */
export const linkPreviews = sqliteTable('link_previews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  urlHash: text('url_hash').notNull().unique(),
  url: text('url').notNull(),
  title: text('title'),
  description: text('description'),
  imageUrl: text('image_url'),
  siteName: text('site_name'),
  fetchedAt: text('fetched_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  /** 1 when the last fetch attempt failed (used to back off retries). */
  fetchFailed: integer('fetch_failed').default(0).notNull(),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'text' | 'poll' — extensible for future post kinds */
  type: text('type').default('text').notNull(),
  content: text('content').notNull(),
  /** JSON array of media URLs (max 5) */
  mediaUrls: text('media_urls'),
  /** 'public' | 'followers' | 'only_me' */
  visibility: text('visibility').default('public').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
  pinnedAt: text('pinned_at'),
  threadRootId: integer('thread_root_id').references((): any => posts.id, { onDelete: 'set null' }),
  parentPostId: integer('parent_post_id').references((): any => posts.id, { onDelete: 'set null' }),
  /** First URL's cached Open Graph preview, if any (only one preview per post). */
  linkPreviewId: integer('link_preview_id').references(() => linkPreviews.id, { onDelete: 'set null' }),
}, (table) => ({
  userIdIdx: index('posts_user_id_idx').on(table.userId),
  createdAtIdx: index('posts_created_at_idx').on(table.createdAt),
  deletedAtIdx: index('posts_deleted_at_idx').on(table.deletedAt),
  typeIdx: index('posts_type_idx').on(table.type),
  visibilityIdx: index('posts_visibility_idx').on(table.visibility),
  userPinnedIdx: index('posts_user_pinned_idx').on(table.userId, table.pinnedAt),
  threadRootIdx: index('posts_thread_root_id_idx').on(table.threadRootId),
  parentPostIdx: index('posts_parent_post_id_idx').on(table.parentPostId),
}));

/** Normalized (lowercase, no leading '#') hashtag registry. */
export const hashtags = sqliteTable('hashtags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tag: text('tag').notNull().unique(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Join table linking posts to the hashtags mentioned in their content. */
export const postHashtags = sqliteTable('post_hashtags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  hashtagId: integer('hashtag_id').notNull().references(() => hashtags.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  postIdIdx: index('post_hashtags_post_id_idx').on(table.postId),
  hashtagIdIdx: index('post_hashtags_hashtag_id_idx').on(table.hashtagId),
  uniquePostHashtag: uniqueIndex('post_hashtags_unique').on(table.postId, table.hashtagId),
}));

export const polls = sqliteTable('polls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().unique().references(() => posts.id, { onDelete: 'cascade' }),
  question: text('question').notNull().default(''),
  endsAt: text('ends_at'),
  maxSelections: integer('max_selections').default(1).notNull(),
  allowVoteChange: integer('allow_vote_change').default(1).notNull(),
  allowVoteRetraction: integer('allow_vote_retraction').default(1).notNull(),
  isAnonymous: integer('is_anonymous').default(0).notNull(),
  /** 'always' | 'after_vote' | 'after_close' */
  resultsVisibility: text('results_visibility').default('always').notNull(),
  /** 'open' | 'closed' */
  status: text('status').default('open').notNull(),
  totalVotes: integer('total_votes').default(0).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  postIdIdx: index('polls_post_id_idx').on(table.postId),
  statusIdx: index('polls_status_idx').on(table.status),
  endsAtIdx: index('polls_ends_at_idx').on(table.endsAt),
}));

export const pollOptions = sqliteTable('poll_options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pollId: integer('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  position: integer('position').notNull(),
  voteCount: integer('vote_count').default(0).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pollIdIdx: index('poll_options_poll_id_idx').on(table.pollId),
}));

export const pollVotes = sqliteTable('poll_votes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  optionId: integer('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
  pollId: integer('poll_id').notNull().references(() => polls.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.optionId] }),
  pollIdIdx: index('poll_votes_poll_id_idx').on(table.pollId),
  userPollIdx: index('poll_votes_user_poll_idx').on(table.userId, table.pollId),
  deletedAtIdx: index('poll_votes_deleted_at_idx').on(table.deletedAt),
}));

export const postEditHistory = sqliteTable('post_edit_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  previousContent: text('previous_content').notNull(),
  /** JSON array of previous media URLs */
  previousMediaUrls: text('previous_media_urls'),
  editedBy: integer('edited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  editedAt: text('edited_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  postIdIdx: index('post_edit_history_post_id_idx').on(table.postId),
  editedAtIdx: index('post_edit_history_edited_at_idx').on(table.editedAt),
}));

export const mediaUploads = sqliteTable('media_uploads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull().unique(),
  url: text('url').notNull(),
  type: text('type').notNull(), // 'avatar' | 'cover' | 'post'
  postId: integer('post_id').references(() => posts.id, { onDelete: 'set null' }),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('media_uploads_user_id_idx').on(table.userId),
  postIdIdx: index('media_uploads_post_id_idx').on(table.postId),
  typeIdx: index('media_uploads_type_idx').on(table.type),
}));

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => comments.id, { onDelete: 'cascade' }), // Self reference for nesting
  content: text('content').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
}, (table) => ({
  postIdIdx: index('comments_post_id_idx').on(table.postId),
  parentIdIdx: index('comments_parent_id_idx').on(table.parentId),
  userIdIdx: index('comments_user_id_idx').on(table.userId),
  deletedAtIdx: index('comments_deleted_at_idx').on(table.deletedAt),
}));

export const userFollows = sqliteTable('user_follows', {
  followerId: integer('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: integer('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.followerId, table.followingId] }),
  followingIdIdx: index('user_follows_following_id_idx').on(table.followingId),
  deletedAtIdx: index('user_follows_deleted_at_idx').on(table.deletedAt),
}));

export const followRequests = sqliteTable('follow_requests', {
  requesterId: integer('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: integer('target_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.requesterId, table.targetId] }),
  targetIdIdx: index('follow_requests_target_id_idx').on(table.targetId),
  deletedAtIdx: index('follow_requests_deleted_at_idx').on(table.deletedAt),
}));

export const userBlocks = sqliteTable('user_blocks', {
  blockerId: integer('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: integer('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
  blockedIdIdx: index('user_blocks_blocked_id_idx').on(table.blockedId),
  deletedAtIdx: index('user_blocks_deleted_at_idx').on(table.deletedAt),
}));

export const userMutes = sqliteTable('user_mutes', {
  muterId: integer('muter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mutedId: integer('muted_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.muterId, table.mutedId] }),
  mutedIdIdx: index('user_mutes_muted_id_idx').on(table.mutedId),
  deletedAtIdx: index('user_mutes_deleted_at_idx').on(table.deletedAt),
}));

export const likes = sqliteTable('likes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.postId] }),
  postIdIdx: index('likes_post_id_idx').on(table.postId),
  deletedAtIdx: index('likes_deleted_at_idx').on(table.deletedAt),
}));

export const postBookmarks = sqliteTable('post_bookmarks', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.postId] }),
  postIdIdx: index('post_bookmarks_post_id_idx').on(table.postId),
  deletedAtIdx: index('post_bookmarks_deleted_at_idx').on(table.deletedAt),
}));

export const postShares = sqliteTable('post_shares', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  postIdIdx: index('post_shares_post_id_idx').on(table.postId),
  userIdIdx: index('post_shares_user_id_idx').on(table.userId),
}));

export const commentLikes = sqliteTable('comment_likes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commentId: integer('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.commentId] }),
  commentIdIdx: index('comment_likes_comment_id_idx').on(table.commentId),
  deletedAtIdx: index('comment_likes_deleted_at_idx').on(table.deletedAt),
}));

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: integer('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  read: integer('read').default(0).notNull(), // 0 = unread, 1 = read
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
}, (table) => ({
  senderIdIdx: index('messages_sender_id_idx').on(table.senderId),
  receiverIdIdx: index('messages_receiver_id_idx').on(table.receiverId),
  receiverReadIdx: index('messages_receiver_id_read_idx').on(table.receiverId, table.read),
  deletedAtIdx: index('messages_deleted_at_idx').on(table.deletedAt),
}));

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // recipient
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // actor
  type: text('type').notNull(), // 'like', 'comment', 'message', 'mention', 'system'
  /** What `entity_id` points at: 'post' | 'message' | 'system' (nullable for pre-migration rows) */
  entityType: text('entity_type'),
  /** post id, message id, or system_broadcasts.id when type/entity_type is system */
  entityId: integer('entity_id').notNull(),
  /** Optional comment for deep-link (comment / mention-in-comment). No FK — keep leaf-table flexibility. */
  commentId: integer('comment_id'),
  content: text('content').notNull(),
  /** 'social' (default) or 'gamification' — gamification rows appear in the System inbox tab */
  category: text('category').default('social').notNull(),
  read: integer('read').default(0).notNull(), // 0 = unread, 1 = read
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('notifications_user_id_idx').on(table.userId),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
  userIdReadIdx: index('notifications_user_id_read_idx').on(table.userId, table.read),
  userIdCategoryReadIdx: index('notifications_user_id_category_read_idx').on(table.userId, table.category, table.read),
}));

/** User-submitted reports for admin review. */
export const contentReports = sqliteTable('content_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reporterId: integer('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'user' | 'post' | 'comment' */
  targetType: text('target_type').notNull(),
  targetId: integer('target_id').notNull(),
  /** 'spam' | 'harassment' | 'hate' | 'misinformation' | 'nudity' | 'other' */
  reason: text('reason').notNull(),
  details: text('details'),
  /** 'pending' | 'dismissed' | 'action_taken' */
  status: text('status').default('pending').notNull(),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  statusIdx: index('content_reports_status_idx').on(table.status),
  targetIdx: index('content_reports_target_idx').on(table.targetType, table.targetId),
  reporterTargetIdx: index('content_reports_reporter_target_idx').on(table.reporterId, table.targetType, table.targetId),
}));

/** Admin-configurable platform settings (key-value). */
export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Per-user gamification summary (points + level). */
export const userGamification = sqliteTable('user_gamification', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').default(0).notNull(),
  level: integer('level').default(1).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/** Flexible metric counters keyed by (user_id, metric_key). */
export const userStatCounters = sqliteTable('user_stat_counters', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  metricKey: text('metric_key').notNull(),
  value: integer('value').default(0).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.metricKey] }),
}));

/** Admin-defined badge definitions. */
export const badges = sqliteTable('badges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  imageUrl: text('image_url'),
  isActive: integer('is_active').default(1).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'),
}, (table) => ({
  isActiveIdx: index('badges_is_active_idx').on(table.isActive),
}));

/** Earning rules attached to badges (metric + threshold). */
export const badgeRules = sqliteTable('badge_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  badgeId: integer('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
  metricKey: text('metric_key').notNull(),
  operator: text('operator').default('>=').notNull(),
  threshold: integer('threshold').notNull(),
}, (table) => ({
  badgeIdIdx: index('badge_rules_badge_id_idx').on(table.badgeId),
  metricKeyIdx: index('badge_rules_metric_key_idx').on(table.metricKey),
}));

/** Points awarded per action_type (admin-configurable). */
export const pointRules = sqliteTable('point_rules', {
  actionType: text('action_type').primaryKey(),
  points: integer('points').default(0).notNull(),
  isActive: integer('is_active').default(1).notNull(),
});

/** Level breakpoints: level N starts at min_points total. */
export const levelConfig = sqliteTable('level_config', {
  level: integer('level').primaryKey(),
  minPoints: integer('min_points').notNull(),
  /** Max badges a user at this level may equip next to their name. Admins bypass this. */
  maxEquippedBadges: integer('max_equipped_badges').default(0).notNull(),
});

/** Badges earned by users (idempotent — one row per user + badge). */
export const userBadges = sqliteTable('user_badges', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  badgeId: integer('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
  earnedAt: text('earned_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.badgeId] }),
  badgeIdIdx: index('user_badges_badge_id_idx').on(table.badgeId),
}));

/** Badges a user has chosen to display next to their username (subset of earned badges). */
export const userEquippedBadges = sqliteTable('user_equipped_badges', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  badgeId: integer('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').default(0).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.badgeId] }),
  userIdIdx: index('user_equipped_badges_user_id_idx').on(table.userId),
}));

/** Audit log of point changes per action. */
export const pointsLedger = sqliteTable('points_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  delta: integer('delta').notNull(),
  metadata: text('metadata'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('points_ledger_user_id_idx').on(table.userId),
  createdAtIdx: index('points_ledger_created_at_idx').on(table.createdAt),
}));

/** Archived points_ledger rows older than retention window. */
export const pointsLedgerArchive = sqliteTable('points_ledger_archive', {
  id: integer('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  delta: integer('delta').notNull(),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull(),
  archivedAt: text('archived_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('points_ledger_archive_user_id_idx').on(table.userId),
  createdAtIdx: index('points_ledger_archive_created_at_idx').on(table.createdAt),
}));

/** Calendar-day streak tracking (login, etc.). */
export const userStreaks = sqliteTable('user_streaks', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  streakType: text('streak_type').notNull(),
  current: integer('current').default(0).notNull(),
  longest: integer('longest').default(0).notNull(),
  lastActivityDate: text('last_activity_date'),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.streakType] }),
}));

/** Time-boxed gamification events. */
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  status: text('status').default('draft').notNull(),
  bannerUrl: text('banner_url'),
  requiresOptIn: integer('requires_opt_in').default(1).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  statusIdx: index('events_status_idx').on(table.status),
  endsAtIdx: index('events_ends_at_idx').on(table.endsAt),
}));

/** Win rules attached to events. */
export const eventRules = sqliteTable('event_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  metricKey: text('metric_key').notNull(),
  winType: text('win_type').notNull(),
  config: text('config').notNull(),
}, (table) => ({
  eventIdIdx: index('event_rules_event_id_idx').on(table.eventId),
}));

/** Opted-in participants and event-period scores. */
export const eventParticipants = sqliteTable('event_participants', {
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: integer('score').default(0).notNull(),
  joinedAt: text('joined_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.eventId, table.userId] }),
  scoreIdx: index('event_participants_score_idx').on(table.eventId, table.score),
}));

/** Recorded event prizes per user. */
export const eventWins = sqliteTable('event_wins', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  prizeType: text('prize_type').notNull(),
  prizeRef: text('prize_ref'),
  wonAt: text('won_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  eventUserIdx: index('event_wins_event_user_idx').on(table.eventId, table.userId),
}));

/** Admin system message broadcasts — always persisted for audit, regardless of delivery mode. */
export const systemBroadcasts = sqliteTable('system_broadcasts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  /** 'notification' | 'toast' | 'both' */
  delivery: text('delivery').notNull(),
  /** Recipients who received an inbox notification row (0 for toast-only). */
  notificationsCreated: integer('notifications_created').default(0).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  senderIdIdx: index('system_broadcasts_sender_id_idx').on(table.senderId),
  createdAtIdx: index('system_broadcasts_created_at_idx').on(table.createdAt),
}));

/**
 * Security audit log — one row per auth event or privileged admin action.
 *
 * Retention policy:
 *  - Active rows are hard-deleted after 90 days by a scheduled job.
 *  - When a user deletes their account, their rows are soft-deleted (deleted_at set).
 *  - Soft-deleted rows are hard-deleted after 90 days from deleted_at.
 *
 * Geo data is sourced from Cloudflare's request.cf object (zero cost, zero latency).
 * IP address is PII — ensure your Privacy Policy discloses this collection.
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Nullable: failed logins before the user row is found won't have a userId. */
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  /**
   * 'login' | 'register' | 'logout' | 'failed_login' |
   * 'password_change' | 'account_delete' |
   * 'admin_impersonate' | 'role_change'
   */
  eventType: text('event_type').notNull(),
  /** 1 = success, 0 = failure */
  success: integer('success').notNull(),
  /** 'bad_password' | 'user_not_found' | 'account_deleted' | 'token_invalid' etc. */
  failureReason: text('failure_reason'),

  // --- Network ---
  ipAddress: text('ip_address'),

  // --- Geolocation (from Cloudflare request.cf — no external API needed) ---
  country: text('country'),     // ISO 3166-1 alpha-2, e.g. "US"
  region: text('region'),       // e.g. "California"
  city: text('city'),           // e.g. "San Francisco"
  postalCode: text('postal_code'), // e.g. "94102"
  latitude: text('latitude'),   // approximate, e.g. "37.7749"
  longitude: text('longitude'), // approximate, e.g. "-122.4194"
  timezone: text('timezone'),   // e.g. "America/New_York"

  // --- Device / Browser (parsed from User-Agent) ---
  userAgent: text('user_agent'),
  /** 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown' */
  deviceType: text('device_type'),
  os: text('os'),               // e.g. "iOS 17.4"
  browser: text('browser'),     // e.g. "Safari 17"

  // --- Client context ---
  /** ISO-8601 timestamp sent by the browser — captures the user's local clock & offset. */
  clientLocalTime: text('client_local_time'),
  /** UUID grouping all events in a single browser session. */
  sessionId: text('session_id'),

  // --- Admin action metadata ---
  /** For admin_impersonate / role_change: the affected user. */
  targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'set null' }),

  // --- Lifecycle ---
  /** Set when the owning user soft-deletes their account. Hard-purged after 90 days. */
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
  eventTypeIdx: index('audit_logs_event_type_idx').on(table.eventType),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  ipAddressIdx: index('audit_logs_ip_address_idx').on(table.ipAddress),
  sessionIdIdx: index('audit_logs_session_id_idx').on(table.sessionId),
  deletedAtIdx: index('audit_logs_deleted_at_idx').on(table.deletedAt),
}));
