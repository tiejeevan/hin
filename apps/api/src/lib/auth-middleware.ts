import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { PermissionKey } from '@hin/types';
import { getAuthUser } from './auth';
import { hasPermission, type AppVariables } from './permissions';

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

function authUserFrom(c: AppContext) {
  return getAuthUser(c as unknown as Context<{ Bindings: Env }>);
}

export async function requireAuth(c: AppContext, next: Next) {
  const user = await authUserFrom(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  return next();
}

export function requireRole(role: 'admin' | 'moderator') {
  return async (c: AppContext, next: Next) => {
    const user = await authUserFrom(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (user.role !== role && user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }
    return next();
  };
}

export function requirePermission(key: PermissionKey) {
  return async (c: AppContext, next: Next) => {
    const user = await authUserFrom(c);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const db = drizzle(c.env.DB, { schema });
    const allowed = await hasPermission(c, db, user, key);
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);
    return next();
  };
}
