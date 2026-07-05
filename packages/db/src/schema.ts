import { sqliteTable, integer, text, primaryKey, index } from 'drizzle-orm/sqlite-core';
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
}, (table) => ({
  deletedAtIdx: index('users_deleted_at_idx').on(table.deletedAt),
  isPrivateIdx: index('users_is_private_idx').on(table.isPrivate),
}));

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
}, (table) => ({
  userIdIdx: index('posts_user_id_idx').on(table.userId),
  createdAtIdx: index('posts_created_at_idx').on(table.createdAt),
  deletedAtIdx: index('posts_deleted_at_idx').on(table.deletedAt),
  typeIdx: index('posts_type_idx').on(table.type),
  visibilityIdx: index('posts_visibility_idx').on(table.visibility),
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
  read: integer('read').default(0).notNull(), // 0 = unread, 1 = read
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('notifications_user_id_idx').on(table.userId),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
  userIdReadIdx: index('notifications_user_id_read_idx').on(table.userId, table.read),
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
