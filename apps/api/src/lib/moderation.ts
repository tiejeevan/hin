import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql, count, desc, isNotNull, lt } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { ContentModerationAction, ModerationAuditLogEntry, PermissionKey } from '@hin/types';
import { canActOnTarget } from './moderation-guard';
import { writeModerationAuditLog } from './moderation-audit';
import { notifyModerationTarget } from './moderation-notify';
import type { Env } from '../types';
import { hasPermissionInSet, type PermissionsResult } from './permissions';

type Db = ReturnType<typeof drizzle<typeof schema>>;

type Actor = { id: number; username: string; role: string };

async function getPostOwner(db: Db, postId: number) {
  return db
    .select({ userId: schema.posts.userId, role: schema.users.role })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(eq(schema.posts.id, postId))
    .get();
}

async function getCommentOwner(db: Db, commentId: number) {
  return db
    .select({ userId: schema.comments.userId, role: schema.users.role, postId: schema.comments.postId })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.id, commentId))
    .get();
}

function err(message: string, code: number) {
  return { ok: false as const, error: message, code };
}

export async function maybeClearExpiredSuspension(db: Db, userId: number): Promise<void> {
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return;
  if (user.accountModerationStatus !== 'suspended' || !user.accountModerationUntil) return;
  if (new Date(user.accountModerationUntil).getTime() > Date.now()) return;
  await db
    .update(schema.users)
    .set({
      accountModerationStatus: 'active',
      accountModerationReason: null,
      accountModerationUntil: null,
    })
    .where(eq(schema.users.id, userId))
    .run();
}

async function applyPostModeration(
  db: Db,
  env: Env | undefined,
  actor: Actor,
  postId: number,
  action: ContentModerationAction,
  reason: string,
  auditAction: string,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return err('Post not found', 404);
  const owner = await getPostOwner(db, postId);
  if (!owner || !canActOnTarget(actor.role, owner.role, actor.id, owner.userId)) {
    return err('Forbidden', 403);
  }

  const now = sql`CURRENT_TIMESTAMP`;
  await db
    .update(schema.posts)
    .set({
      deletedAt: now,
      moderationAction: action,
      moderationReason: reason,
      moderatedBy: actor.id,
      moderatedAt: new Date().toISOString(),
    })
    .where(eq(schema.posts.id, postId))
    .run();

  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: auditAction,
    targetType: 'post',
    targetId: postId,
    reason,
  });

  await notifyModerationTarget(db, env, {
    recipientId: owner.userId,
    actorId: actor.id,
    actorUsername: actor.username,
    content: `Your post was ${action === 'hidden' ? 'hidden' : 'removed'}. Reason: ${reason}`,
    entityType: 'post',
    entityId: postId,
  });

  return { ok: true };
}

export async function hidePost(db: Db, env: Env | undefined, actor: Actor, postId: number, reason: string) {
  return applyPostModeration(db, env, actor, postId, 'hidden', reason, 'post.hide');
}

export async function removePost(db: Db, env: Env | undefined, actor: Actor, postId: number, reason: string) {
  return applyPostModeration(db, env, actor, postId, 'removed', reason, 'post.remove');
}

export async function unhidePost(db: Db, actor: Actor, postId: number) {
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return err('Post not found', 404);
  if (post.moderationAction !== 'hidden') return err('Post is not hidden', 400);
  await db
    .update(schema.posts)
    .set({ deletedAt: null, moderationAction: null, moderationReason: null, moderatedBy: null, moderatedAt: null })
    .where(eq(schema.posts.id, postId))
    .run();
  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'post.unhide',
    targetType: 'post',
    targetId: postId,
  });
  return { ok: true as const };
}

export async function restorePost(db: Db, actor: Actor, postId: number) {
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return err('Post not found', 404);
  if (post.moderationAction !== 'removed') return err('Post is not removed', 400);
  await db
    .update(schema.posts)
    .set({ deletedAt: null, moderationAction: null, moderationReason: null, moderatedBy: null, moderatedAt: null })
    .where(eq(schema.posts.id, postId))
    .run();
  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'post.restore',
    targetType: 'post',
    targetId: postId,
  });
  return { ok: true as const };
}

async function applyCommentModeration(
  db: Db,
  env: Env | undefined,
  actor: Actor,
  commentId: number,
  action: ContentModerationAction,
  reason: string,
  auditAction: string,
) {
  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return err('Comment not found', 404);
  const owner = await getCommentOwner(db, commentId);
  if (!owner || !canActOnTarget(actor.role, owner.role, actor.id, owner.userId)) {
    return err('Forbidden', 403);
  }

  await db
    .update(schema.comments)
    .set({
      deletedAt: sql`CURRENT_TIMESTAMP`,
      moderationAction: action,
      moderationReason: reason,
      moderatedBy: actor.id,
      moderatedAt: new Date().toISOString(),
    })
    .where(eq(schema.comments.id, commentId))
    .run();

  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: auditAction,
    targetType: 'comment',
    targetId: commentId,
    reason,
  });

  await notifyModerationTarget(db, env, {
    recipientId: owner.userId,
    actorId: actor.id,
    actorUsername: actor.username,
    content: `Your comment was ${action === 'hidden' ? 'hidden' : 'removed'}. Reason: ${reason}`,
    entityType: 'post',
    entityId: comment.postId,
  });

  return { ok: true as const };
}

export async function hideComment(db: Db, env: Env | undefined, actor: Actor, commentId: number, reason: string) {
  return applyCommentModeration(db, env, actor, commentId, 'hidden', reason, 'comment.hide');
}

export async function removeComment(db: Db, env: Env | undefined, actor: Actor, commentId: number, reason: string) {
  return applyCommentModeration(db, env, actor, commentId, 'removed', reason, 'comment.remove');
}

export async function unhideComment(db: Db, actor: Actor, commentId: number) {
  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return err('Comment not found', 404);
  if (comment.moderationAction !== 'hidden') return err('Comment is not hidden', 400);
  await db
    .update(schema.comments)
    .set({ deletedAt: null, moderationAction: null, moderationReason: null, moderatedBy: null, moderatedAt: null })
    .where(eq(schema.comments.id, commentId))
    .run();
  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'comment.unhide',
    targetType: 'comment',
    targetId: commentId,
  });
  return { ok: true as const };
}

export async function restoreComment(db: Db, actor: Actor, commentId: number) {
  const comment = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).get();
  if (!comment) return err('Comment not found', 404);
  if (comment.moderationAction !== 'removed') return err('Comment is not removed', 400);
  await db
    .update(schema.comments)
    .set({ deletedAt: null, moderationAction: null, moderationReason: null, moderatedBy: null, moderatedAt: null })
    .where(eq(schema.comments.id, commentId))
    .run();
  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'comment.restore',
    targetType: 'comment',
    targetId: commentId,
  });
  return { ok: true as const };
}

export async function setPostCommentsLocked(db: Db, actor: Actor, postId: number, locked: boolean) {
  const post = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) return err('Post not found', 404);
  await db.update(schema.posts).set({ commentsLocked: locked ? 1 : 0 }).where(eq(schema.posts.id, postId)).run();
  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: locked ? 'comment.lock' : 'comment.unlock',
    targetType: 'post',
    targetId: postId,
  });
  return { ok: true as const };
}

async function setAccountModeration(
  db: Db,
  env: Env | undefined,
  actor: Actor,
  targetUserId: number,
  status: 'active' | 'restricted' | 'suspended' | 'banned',
  reason: string,
  until: string | null,
  auditAction: string,
) {
  const target = await db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
  if (!target || target.deletedAt) return err('User not found', 404);
  if (!canActOnTarget(actor.role, target.role, actor.id, targetUserId)) {
    return err('Forbidden', 403);
  }

  const now = new Date().toISOString();
  await db
    .update(schema.users)
    .set({
      accountModerationStatus: status,
      accountModerationReason: status === 'active' ? null : reason,
      accountModerationUntil: status === 'suspended' ? until : null,
      accountModerationSetBy: actor.id,
      accountModerationSetAt: now,
    })
    .where(eq(schema.users.id, targetUserId))
    .run();

  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: auditAction,
    targetType: 'user',
    targetId: targetUserId,
    reason,
    metadata: until ? { until } : undefined,
  });

  if (status !== 'active') {
    await notifyModerationTarget(db, env, {
      recipientId: targetUserId,
      actorId: actor.id,
      actorUsername: actor.username,
      content: `Account action: ${auditAction.replace('user.', '')}. Reason: ${reason}`,
      entityType: 'user',
      entityId: targetUserId,
    });
  }

  return { ok: true as const };
}

export async function warnUser(db: Db, env: Env | undefined, actor: Actor, targetUserId: number, reason: string) {
  const target = await db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
  if (!target || target.deletedAt) return err('User not found', 404);
  if (!canActOnTarget(actor.role, target.role, actor.id, targetUserId)) return err('Forbidden', 403);
  await writeModerationAuditLog(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'user.warn',
    targetType: 'user',
    targetId: targetUserId,
    reason,
  });
  await notifyModerationTarget(db, env, {
    recipientId: targetUserId,
    actorId: actor.id,
    actorUsername: actor.username,
    content: `You received a warning. Reason: ${reason}`,
    entityType: 'user',
    entityId: targetUserId,
  });
  return { ok: true as const };
}

export const restrictUser = (db: Db, env: Env | undefined, actor: Actor, id: number, reason: string) =>
  setAccountModeration(db, env, actor, id, 'restricted', reason, null, 'user.restrict');

export const liftRestriction = (db: Db, env: Env | undefined, actor: Actor, id: number) =>
  setAccountModeration(db, env, actor, id, 'active', '', null, 'user.restrict.lift');

export const suspendUser = (db: Db, env: Env | undefined, actor: Actor, id: number, reason: string, until: string | null) =>
  setAccountModeration(db, env, actor, id, 'suspended', reason, until, 'user.suspend');

export const unsuspendUser = (db: Db, env: Env | undefined, actor: Actor, id: number) =>
  setAccountModeration(db, env, actor, id, 'active', '', null, 'user.unsuspend');

export const banUser = (db: Db, env: Env | undefined, actor: Actor, id: number, reason: string) =>
  setAccountModeration(db, env, actor, id, 'banned', reason, null, 'user.ban');

export const unbanUser = (db: Db, env: Env | undefined, actor: Actor, id: number) =>
  setAccountModeration(db, env, actor, id, 'active', '', null, 'user.unban');

export async function getUserModerationHistory(
  db: Db,
  targetUserId: number,
  cursor: number | null,
): Promise<{ logs: ModerationAuditLogEntry[]; nextCursor: number | null }> {
  const conditions = [
    eq(schema.moderationAuditLogs.targetType, 'user'),
    eq(schema.moderationAuditLogs.targetId, targetUserId),
  ];
  if (cursor) conditions.push(lt(schema.moderationAuditLogs.id, cursor));

  const rows = await db
    .select()
    .from(schema.moderationAuditLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.moderationAuditLogs.id))
    .limit(31)
    .all();

  const hasMore = rows.length > 30;
  const page = hasMore ? rows.slice(0, 30) : rows;

  const logs: ModerationAuditLogEntry[] = await Promise.all(
    page.map(async (row) => {
      const actorUser = row.actorId
        ? await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, row.actorId)).get()
        : null;
      return {
        id: row.id,
        actorId: row.actorId,
        actorUsername: actorUser?.username ?? null,
        actorRole: row.actorRole,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
        beforeState: row.beforeState,
        afterState: row.afterState,
        createdAt: row.createdAt,
      };
    }),
  );

  return { logs, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getModerationDashboardCounts(db: Db, perms: PermissionsResult) {
  const counts: Record<string, number> = {};

  if (hasPermissionInSet(perms, 'report.view')) {
    const pending = await db.select({ value: count() }).from(schema.contentReports).where(eq(schema.contentReports.status, 'pending')).get();
    counts.reportsPending = pending?.value ?? 0;
  }
  if (hasPermissionInSet(perms, 'post.review') || hasPermissionInSet(perms, 'post.view')) {
    const postReports = await db
      .select({ value: count() })
      .from(schema.contentReports)
      .where(and(eq(schema.contentReports.status, 'pending'), eq(schema.contentReports.targetType, 'post')))
      .get();
    counts.postsAwaitingReview = postReports?.value ?? 0;
  }
  if (hasPermissionInSet(perms, 'comment.review') || hasPermissionInSet(perms, 'comment.view')) {
    const commentReports = await db
      .select({ value: count() })
      .from(schema.contentReports)
      .where(and(eq(schema.contentReports.status, 'pending'), eq(schema.contentReports.targetType, 'comment')))
      .get();
    counts.commentsAwaitingReview = commentReports?.value ?? 0;
  }

  return counts;
}

export async function listModeratedPosts(
  db: Db,
  moderationAction: ContentModerationAction,
  cursor: number | null,
  limit = 20,
) {
  const conditions = [eq(schema.posts.moderationAction, moderationAction), isNotNull(schema.posts.moderationAction)];
  if (cursor) conditions.push(lt(schema.posts.id, cursor));

  const rows = await db
    .select({
      id: schema.posts.id,
      content: schema.posts.content,
      moderationReason: schema.posts.moderationReason,
      moderatedAt: schema.posts.moderatedAt,
      username: schema.users.username,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.posts.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { posts: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export function permissionForReportAction(action: string): PermissionKey | null {
  switch (action) {
    case 'review':
      return 'report.review';
    case 'resolve':
      return 'report.resolve';
    case 'dismiss':
      return 'report.dismiss';
    case 'escalate':
      return 'report.escalate';
    case 'delete_content':
    case 'delete_user':
      return 'report.resolve';
    default:
      return null;
  }
}
