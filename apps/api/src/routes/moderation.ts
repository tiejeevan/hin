import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { ModerationReasonSchema, SuspendUserSchema, type PermissionKey } from '@hin/types';
import type { Env } from '../types';
import type { AppVariables } from '../lib/permissions';
import { getAuthUser } from '../lib/auth';
import { getUserPermissions, hasPermissionInSet, permissionsToArray } from '../lib/permissions';
import {
  banUser,
  getModerationDashboardCounts,
  getUserModerationHistory,
  hideComment,
  hidePost,
  listModeratedPosts,
  removeComment,
  removePost,
  restoreComment,
  restorePost,
  restrictUser,
  setPostCommentsLocked,
  suspendUser,
  unbanUser,
  unhideComment,
  unhidePost,
  unsuspendUser,
  warnUser,
} from '../lib/moderation';

const moderation = new Hono<{ Bindings: Env; Variables: AppVariables }>();

moderation.get('/me/status', async (c) => {
  const authUser = await authUserFrom(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({
    accountModerationStatus: authUser.accountModerationStatus ?? 'active',
    reason: authUser.accountModerationReason ?? null,
    until: authUser.accountModerationUntil ?? null,
    moderatorStatus: authUser.moderatorStatus ?? null,
    role: authUser.role,
  });
});

moderation.get('/dashboard', async (c) => {
  const authUser = await authUserFrom(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
  const db = drizzle(c.env.DB, { schema });
  const perms = await getUserPermissions(db, authUser);
  const counts = await getModerationDashboardCounts(db, perms);
  return c.json({ counts, permissions: permissionsToArray(perms) });
});

type ModContext = Context<{ Bindings: Env; Variables: AppVariables }>;

function authUserFrom(c: ModContext) {
  return getAuthUser(c as unknown as Context<{ Bindings: Env }>);
}

async function gate(c: ModContext, key: PermissionKey) {
  const authUser = await authUserFrom(c);
  if (!authUser) return null;
  const db = drizzle(c.env.DB, { schema });
  const perms = await getUserPermissions(db, authUser);
  if (!hasPermissionInSet(perms, key)) return null;
  return { authUser, db };
}

function actor(user: { id: number; username: string; role: string }) {
  return { id: user.id, username: user.username, role: user.role };
}

moderation.post('/posts/:id/hide', async (c) => {
  const ctx = await gate(c, 'post.hide');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const postId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await hidePost(ctx.db, c.env, actor(ctx.authUser), postId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/posts/:id/unhide', async (c) => {
  const ctx = await gate(c, 'post.unhide');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const postId = parseInt(c.req.param('id'));
  const result = await unhidePost(ctx.db, actor(ctx.authUser), postId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true });
});

moderation.post('/posts/:id/remove', async (c) => {
  const ctx = await gate(c, 'post.remove');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const postId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await removePost(ctx.db, c.env, actor(ctx.authUser), postId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/posts/:id/restore', async (c) => {
  const ctx = await gate(c, 'post.restore');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const postId = parseInt(c.req.param('id'));
  const result = await restorePost(ctx.db, actor(ctx.authUser), postId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true });
});

moderation.post('/posts/:id/lock-comments', async (c) => {
  const ctx = await gate(c, 'comment.lock');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const postId = parseInt(c.req.param('id'));
  const result = await setPostCommentsLocked(ctx.db, actor(ctx.authUser), postId, true);
  if (!result.ok) return c.json({ error: result.error }, result.code as 404);
  return c.json({ success: true });
});

moderation.post('/posts/:id/unlock-comments', async (c) => {
  const ctx = await gate(c, 'comment.unlock');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const postId = parseInt(c.req.param('id'));
  const result = await setPostCommentsLocked(ctx.db, actor(ctx.authUser), postId, false);
  if (!result.ok) return c.json({ error: result.error }, result.code as 404);
  return c.json({ success: true });
});

moderation.get('/posts', async (c) => {
  const authUser = await authUserFrom(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
  const db = drizzle(c.env.DB, { schema });
  const perms = await getUserPermissions(db, authUser);
  if (!hasPermissionInSet(perms, 'post.view')) return c.json({ error: 'Forbidden' }, 403);
  const action = c.req.query('moderationAction') === 'removed' ? 'removed' : 'hidden';
  const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!) : null;
  const page = await listModeratedPosts(db, action, cursor && !isNaN(cursor) ? cursor : null);
  return c.json(page);
});

moderation.post('/comments/:id/hide', async (c) => {
  const ctx = await gate(c, 'comment.hide');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const commentId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await hideComment(ctx.db, c.env, actor(ctx.authUser), commentId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/comments/:id/unhide', async (c) => {
  const ctx = await gate(c, 'comment.unhide');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const commentId = parseInt(c.req.param('id'));
  const result = await unhideComment(ctx.db, actor(ctx.authUser), commentId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true });
});

moderation.post('/comments/:id/remove', async (c) => {
  const ctx = await gate(c, 'comment.remove');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const commentId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await removeComment(ctx.db, c.env, actor(ctx.authUser), commentId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/comments/:id/restore', async (c) => {
  const ctx = await gate(c, 'comment.restore');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const commentId = parseInt(c.req.param('id'));
  const result = await restoreComment(ctx.db, actor(ctx.authUser), commentId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true });
});

moderation.post('/users/:id/warn', async (c) => {
  const ctx = await gate(c, 'user.warn');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await warnUser(ctx.db, c.env, actor(ctx.authUser), userId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/users/:id/restrict', async (c) => {
  const ctx = await gate(c, 'user.restrict');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await restrictUser(ctx.db, c.env, actor(ctx.authUser), userId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/users/:id/suspend', async (c) => {
  const ctx = await gate(c, 'user.suspend');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const body = SuspendUserSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await suspendUser(ctx.db, c.env, actor(ctx.authUser), userId, body.data.reason, body.data.until ?? null);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/users/:id/unsuspend', async (c) => {
  const ctx = await gate(c, 'user.unsuspend');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const result = await unsuspendUser(ctx.db, c.env, actor(ctx.authUser), userId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/users/:id/ban', async (c) => {
  const ctx = await gate(c, 'user.ban');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const body = ModerationReasonSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.errors[0]?.message }, 400);
  const result = await banUser(ctx.db, c.env, actor(ctx.authUser), userId, body.data.reason);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.post('/users/:id/unban', async (c) => {
  const ctx = await gate(c, 'user.unban');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const result = await unbanUser(ctx.db, c.env, actor(ctx.authUser), userId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 403 | 404);
  return c.json({ success: true });
});

moderation.get('/users/:id/history', async (c) => {
  const ctx = await gate(c, 'user.view_history');
  if (!ctx) return c.json({ error: 'Forbidden' }, 403);
  const userId = parseInt(c.req.param('id'));
  const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!) : null;
  const page = await getUserModerationHistory(ctx.db, userId, cursor && !isNaN(cursor) ? cursor : null);
  return c.json(page);
});

export default moderation;
