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
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete for users
}, (table) => ({
  deletedAtIdx: index('users_deleted_at_idx').on(table.deletedAt),
}));

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 'text' | 'poll' — extensible for future post kinds */
  type: text('type').default('text').notNull(),
  content: text('content').notNull(),
  /** JSON array of media URLs (max 5) */
  mediaUrls: text('media_urls'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
}, (table) => ({
  userIdIdx: index('posts_user_id_idx').on(table.userId),
  createdAtIdx: index('posts_created_at_idx').on(table.createdAt),
  deletedAtIdx: index('posts_deleted_at_idx').on(table.deletedAt),
  typeIdx: index('posts_type_idx').on(table.type),
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
