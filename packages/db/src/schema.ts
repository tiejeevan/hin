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
  content: text('content').notNull(),
  /** JSON array of media URLs (max 5) */
  mediaUrls: text('media_urls'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: text('deleted_at'), // Soft delete
}, (table) => ({
  userIdIdx: index('posts_user_id_idx').on(table.userId),
  createdAtIdx: index('posts_created_at_idx').on(table.createdAt),
  deletedAtIdx: index('posts_deleted_at_idx').on(table.deletedAt),
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
  type: text('type').notNull(), // 'like', 'comment', 'message'
  entityId: integer('entity_id').notNull(),
  content: text('content').notNull(),
  read: integer('read').default(0).notNull(), // 0 = unread, 1 = read
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('notifications_user_id_idx').on(table.userId),
  createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
}));
