import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, lt, sql, count } from 'drizzle-orm';
import * as schema from '@hin/db';
import type {
  ContentReport,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  ReviewReportAction,
} from '@hin/types';
import { assertCanViewPost } from './postVisibility';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const LIST_PAGE_SIZE = 20;

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: number;
  reason: ReportReason;
  details?: string;
};

async function validateReportTarget(
  db: Db,
  reporterId: number,
  targetType: ReportTargetType,
  targetId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  if (targetType === 'user') {
    if (targetId === reporterId) {
      return { ok: false, error: 'Cannot report yourself', code: 400 };
    }
    const user = await db
      .select({ id: schema.users.id, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, targetId))
      .get();
    if (!user || user.deletedAt) {
      return { ok: false, error: 'User not found', code: 404 };
    }
    return { ok: true };
  }

  if (targetType === 'post') {
    const access = await assertCanViewPost(db, reporterId, targetId);
    if (!access.ok) return { ok: false, error: access.error, code: access.status };
    if (access.post.userId === reporterId) {
      return { ok: false, error: 'Cannot report your own post', code: 400 };
    }
    return { ok: true };
  }

  // comment
  const comment = await db
    .select({
      id: schema.comments.id,
      userId: schema.comments.userId,
      postId: schema.comments.postId,
      deletedAt: schema.comments.deletedAt,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, targetId))
    .get();
  if (!comment || comment.deletedAt) {
    return { ok: false, error: 'Comment not found', code: 404 };
  }
  if (comment.userId === reporterId) {
    return { ok: false, error: 'Cannot report your own comment', code: 400 };
  }
  const access = await assertCanViewPost(db, reporterId, comment.postId);
  if (!access.ok) return { ok: false, error: access.error, code: access.status };
  return { ok: true };
}

export async function createReport(
  db: Db,
  reporterId: number,
  input: CreateReportInput,
): Promise<
  | { ok: true; report: ContentReport }
  | { ok: false; error: string; code: number }
> {
  const validation = await validateReportTarget(db, reporterId, input.targetType, input.targetId);
  if (!validation.ok) return validation;

  const existing = await db
    .select({ id: schema.contentReports.id })
    .from(schema.contentReports)
    .where(
      and(
        eq(schema.contentReports.reporterId, reporterId),
        eq(schema.contentReports.targetType, input.targetType),
        eq(schema.contentReports.targetId, input.targetId),
        eq(schema.contentReports.status, 'pending'),
      ),
    )
    .get();

  if (existing) {
    return { ok: false, error: 'You already reported this content', code: 409 };
  }

  const [inserted] = await db
    .insert(schema.contentReports)
    .values({
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details?.trim() || null,
      status: 'pending',
    })
    .returning();

  const reporter = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, reporterId))
    .get();

  const preview = await getTargetPreview(db, input.targetType, input.targetId);

  return {
    ok: true,
    report: {
      id: inserted.id,
      reporterId,
      reporterUsername: reporter?.username ?? 'Unknown',
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: inserted.details,
      status: 'pending',
      createdAt: inserted.createdAt,
      ...preview,
    },
  };
}

async function getTargetPreview(
  db: Db,
  targetType: ReportTargetType,
  targetId: number,
): Promise<{ targetPreview?: string | null; targetUsername?: string | null }> {
  if (targetType === 'user') {
    const user = await db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(eq(schema.users.id, targetId))
      .get();
    return { targetUsername: user?.username ?? null, targetPreview: user?.username ?? null };
  }
  if (targetType === 'post') {
    const post = await db
      .select({
        content: schema.posts.content,
        username: schema.users.username,
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .where(eq(schema.posts.id, targetId))
      .get();
    const snippet = post?.content?.slice(0, 120) ?? null;
    return { targetPreview: snippet, targetUsername: post?.username ?? null };
  }
  const comment = await db
    .select({
      content: schema.comments.content,
      username: schema.users.username,
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id))
    .where(eq(schema.comments.id, targetId))
    .get();
  const snippet = comment?.content?.slice(0, 120) ?? null;
  return { targetPreview: snippet, targetUsername: comment?.username ?? null };
}

export async function listReports(
  db: Db,
  status: ReportStatus,
  cursor: number | null,
  limit = LIST_PAGE_SIZE,
): Promise<{ reports: ContentReport[]; nextCursor: number | null }> {
  const conditions = [eq(schema.contentReports.status, status)];
  if (cursor !== null) {
    conditions.push(lt(schema.contentReports.id, cursor));
  }

  const rows = await db
    .select({
      id: schema.contentReports.id,
      reporterId: schema.contentReports.reporterId,
      reporterUsername: schema.users.username,
      targetType: schema.contentReports.targetType,
      targetId: schema.contentReports.targetId,
      reason: schema.contentReports.reason,
      details: schema.contentReports.details,
      status: schema.contentReports.status,
      reviewedBy: schema.contentReports.reviewedBy,
      reviewedAt: schema.contentReports.reviewedAt,
      createdAt: schema.contentReports.createdAt,
    })
    .from(schema.contentReports)
    .innerJoin(schema.users, eq(schema.contentReports.reporterId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.contentReports.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const reports: ContentReport[] = await Promise.all(
    pageRows.map(async (row) => {
      const preview = await getTargetPreview(
        db,
        row.targetType as ReportTargetType,
        row.targetId,
      );
      return {
        id: row.id,
        reporterId: row.reporterId,
        reporterUsername: row.reporterUsername,
        targetType: row.targetType as ReportTargetType,
        targetId: row.targetId,
        reason: row.reason as ReportReason,
        details: row.details,
        status: row.status as ReportStatus,
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt,
        createdAt: row.createdAt,
        ...preview,
      };
    }),
  );

  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;
  return { reports, nextCursor };
}

export async function reviewReport(
  db: Db,
  adminId: number,
  reportId: number,
  action: ReviewReportAction,
): Promise<{ ok: true; report: ContentReport } | { ok: false; error: string; code: number }> {
  const report = await db
    .select()
    .from(schema.contentReports)
    .where(eq(schema.contentReports.id, reportId))
    .get();

  if (!report) return { ok: false, error: 'Report not found', code: 404 };
  if (report.status !== 'pending') {
    return { ok: false, error: 'Report already reviewed', code: 400 };
  }

  const reviewedAt = new Date().toISOString();

  if (action === 'dismiss') {
    await db
      .update(schema.contentReports)
      .set({ status: 'dismissed', reviewedBy: adminId, reviewedAt })
      .where(eq(schema.contentReports.id, reportId))
      .run();
  } else if (action === 'delete_content') {
    if (report.targetType === 'user') {
      return { ok: false, error: 'Use delete_user for user reports', code: 400 };
    }
    if (report.targetType === 'post') {
      await db
        .update(schema.posts)
        .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(schema.posts.id, report.targetId))
        .run();
    } else {
      await db
        .update(schema.comments)
        .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(schema.comments.id, report.targetId))
        .run();
    }
    await db
      .update(schema.contentReports)
      .set({ status: 'action_taken', reviewedBy: adminId, reviewedAt })
      .where(eq(schema.contentReports.id, reportId))
      .run();
  } else if (action === 'delete_user') {
    if (report.targetType !== 'user') {
      return { ok: false, error: 'delete_user only applies to user reports', code: 400 };
    }
    if (report.targetId === adminId) {
      return { ok: false, error: 'Cannot delete your own admin account', code: 400 };
    }
    const user = await db
      .select({ id: schema.users.id, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, report.targetId))
      .get();
    if (!user || user.deletedAt) {
      return { ok: false, error: 'User not found', code: 404 };
    }
    await db
      .update(schema.users)
      .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(schema.users.id, report.targetId))
      .run();
    await db
      .update(schema.contentReports)
      .set({ status: 'action_taken', reviewedBy: adminId, reviewedAt })
      .where(eq(schema.contentReports.id, reportId))
      .run();
  }

  const reporter = await db
    .select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, report.reporterId))
    .get();

  const preview = await getTargetPreview(
    db,
    report.targetType as ReportTargetType,
    report.targetId,
  );

  const updated = await db
    .select()
    .from(schema.contentReports)
    .where(eq(schema.contentReports.id, reportId))
    .get();

  return {
    ok: true,
    report: {
      id: reportId,
      reporterId: report.reporterId,
      reporterUsername: reporter?.username ?? 'Unknown',
      targetType: report.targetType as ReportTargetType,
      targetId: report.targetId,
      reason: report.reason as ReportReason,
      details: report.details,
      status: (updated?.status ?? 'action_taken') as ReportStatus,
      reviewedBy: adminId,
      reviewedAt,
      createdAt: report.createdAt,
      ...preview,
    },
  };
}

export async function getPendingReportCount(db: Db): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(schema.contentReports)
    .where(eq(schema.contentReports.status, 'pending'))
    .get();
  return res?.value ?? 0;
}
