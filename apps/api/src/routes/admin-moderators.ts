import { Hono, type Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import {
  PromoteModeratorSchema,
  UpdateModeratorPermissionsSchema,
  UpdateModeratorStatusSchema,
} from '@hin/types';
import type { Env } from '../types';
import type { AppVariables } from '../lib/permissions';
import { getAuthUser } from '../lib/auth';
import {
  getModeratorDetail,
  listModerators,
  listModeratorActivity,
  promoteToModerator,
  removeModeratorRole,
  setModeratorStatus,
  updateModeratorPermissions,
} from '../lib/moderators';

type AdminModContext = Context<{ Bindings: Env; Variables: AppVariables }>;

function authUserFrom(c: AdminModContext) {
  return getAuthUser(c as unknown as Context<{ Bindings: Env }>);
}

const adminModerators = new Hono<{ Bindings: Env; Variables: AppVariables }>();

adminModerators.use('*', async (c, next) => {
  const user = await authUserFrom(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  await next();
});

adminModerators.get('/', async (c) => {
  const status = c.req.query('status');
  const db = drizzle(c.env.DB, { schema });
  const moderators = await listModerators(
    db,
    status === 'active' || status === 'suspended' ? status : undefined,
  );
  return c.json({ moderators });
});

adminModerators.get('/:id/activity', async (c) => {
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid id' }, 400);
  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? parseInt(cursorParam) : null;
  const db = drizzle(c.env.DB, { schema });
  const page = await listModeratorActivity(db, userId, cursor && !isNaN(cursor) ? cursor : null);
  return c.json(page);
});

adminModerators.get('/:id', async (c) => {
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid id' }, 400);
  const db = drizzle(c.env.DB, { schema });
  const detail = await getModeratorDetail(db, userId);
  if (!detail) return c.json({ error: 'Moderator not found' }, 404);
  return c.json(detail);
});

adminModerators.post('/', async (c) => {
  const authUser = (await authUserFrom(c))!;
  const body = await c.req.json().catch(() => null);
  const parsed = PromoteModeratorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }
  const db = drizzle(c.env.DB, { schema });
  const result = await promoteToModerator(db, authUser.id, parsed.data.userId, {
    permissionKeys: parsed.data.permissionKeys,
    preset: parsed.data.preset,
  });
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true, moderator: result.detail });
});

adminModerators.put('/:id/permissions', async (c) => {
  const authUser = (await authUserFrom(c))!;
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid id' }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateModeratorPermissionsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }
  const db = drizzle(c.env.DB, { schema });
  const result = await updateModeratorPermissions(db, authUser.id, userId, parsed.data.permissionKeys);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true, added: result.added, removed: result.removed, moderator: result.detail });
});

adminModerators.patch('/:id', async (c) => {
  const authUser = (await authUserFrom(c))!;
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid id' }, 400);
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateModeratorStatusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }
  const db = drizzle(c.env.DB, { schema });
  const result = await setModeratorStatus(db, authUser.id, userId, parsed.data.status);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true });
});

adminModerators.delete('/:id', async (c) => {
  const authUser = (await authUserFrom(c))!;
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid id' }, 400);
  const db = drizzle(c.env.DB, { schema });
  const result = await removeModeratorRole(db, authUser.id, userId);
  if (!result.ok) return c.json({ error: result.error }, result.code as 400 | 404);
  return c.json({ success: true });
});

export default adminModerators;
