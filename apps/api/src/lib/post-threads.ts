import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, count, asc } from 'drizzle-orm';
import * as schema from '@hin/db';
import { assertCanViewPost } from './postVisibility';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type ThreadReplyFields = {
  threadRootId: number;
  parentPostId: number;
};

export async function validateThreadReply(
  db: Db,
  userId: number,
  replyToPostId: number,
): Promise<
  | { ok: true; fields: ThreadReplyFields }
  | { ok: false; error: string; code: number }
> {
  const parent = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, replyToPostId))
    .get();

  if (!parent || parent.deletedAt) {
    return { ok: false, error: 'Parent post not found', code: 404 };
  }
  if (parent.userId !== userId) {
    return { ok: false, error: 'Only the author can add to their thread', code: 403 };
  }
  if (parent.type === 'poll') {
    return { ok: false, error: 'Cannot reply in a poll thread', code: 400 };
  }

  const threadRootId = parent.threadRootId ?? parent.id;

  return {
    ok: true,
    fields: {
      threadRootId,
      parentPostId: parent.id,
    },
  };
}

export async function countThreadReplies(db: Db, rootId: number): Promise<number> {
  const res = await db
    .select({ value: count() })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.threadRootId, rootId),
        isNull(schema.posts.deletedAt),
      ),
    )
    .get();
  return res?.value ?? 0;
}

export async function resolveThreadRootId(
  db: Db,
  postId: number,
): Promise<number | null> {
  const post = await db
    .select({
      id: schema.posts.id,
      threadRootId: schema.posts.threadRootId,
      deletedAt: schema.posts.deletedAt,
    })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .get();

  if (!post || post.deletedAt) return null;
  return post.threadRootId ?? post.id;
}

export async function getThreadPostRows(
  db: Db,
  rootId: number,
): Promise<Array<{
  id: number;
  userId: number;
  type: string | null;
  content: string;
  mediaUrls: string | null;
  visibility: string | null;
  createdAt: string;
  pinnedAt: string | null;
  threadRootId: number | null;
  parentPostId: number | null;
  linkPreviewId: number | null;
  username: string;
  authorAvatarUrl: string | null;
  authorRole: string;
}>> {
  return db
    .select({
      id: schema.posts.id,
      userId: schema.posts.userId,
      type: schema.posts.type,
      content: schema.posts.content,
      mediaUrls: schema.posts.mediaUrls,
      visibility: schema.posts.visibility,
      createdAt: schema.posts.createdAt,
      pinnedAt: schema.posts.pinnedAt,
      threadRootId: schema.posts.threadRootId,
      parentPostId: schema.posts.parentPostId,
      linkPreviewId: schema.posts.linkPreviewId,
      username: schema.users.username,
      authorAvatarUrl: schema.users.avatarUrl,
      authorRole: schema.users.role,
    })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(
      and(
        isNull(schema.posts.deletedAt),
        isNull(schema.users.deletedAt),
        eq(schema.posts.id, rootId),
      ),
    )
    .all()
    .then(async (rootRows) => {
      if (rootRows.length === 0) return [];

      const replies = await db
        .select({
          id: schema.posts.id,
          userId: schema.posts.userId,
          type: schema.posts.type,
          content: schema.posts.content,
          mediaUrls: schema.posts.mediaUrls,
          visibility: schema.posts.visibility,
          createdAt: schema.posts.createdAt,
          pinnedAt: schema.posts.pinnedAt,
          threadRootId: schema.posts.threadRootId,
          parentPostId: schema.posts.parentPostId,
          linkPreviewId: schema.posts.linkPreviewId,
          username: schema.users.username,
          authorAvatarUrl: schema.users.avatarUrl,
          authorRole: schema.users.role,
        })
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
        .where(
          and(
            eq(schema.posts.threadRootId, rootId),
            isNull(schema.posts.deletedAt),
            isNull(schema.users.deletedAt),
          ),
        )
        .orderBy(asc(schema.posts.id))
        .all();

      return [...rootRows, ...replies];
    });
}

export async function assertCanViewThread(
  db: Db,
  viewerId: number | null,
  postId: number,
): Promise<
  | { ok: true; rootId: number }
  | { ok: false; status: 404 | 403; error: string }
> {
  const rootId = await resolveThreadRootId(db, postId);
  if (!rootId) {
    return { ok: false, status: 404, error: 'Post not found' };
  }

  const access = await assertCanViewPost(db, viewerId, rootId);
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }

  return { ok: true, rootId };
}
