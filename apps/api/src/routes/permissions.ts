import { Hono } from 'hono';
import { PERMISSION_CATALOG, MODERATOR_PRESETS, DEFAULT_MODERATOR_PERMISSIONS } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';

const permissionsRoute = new Hono<{ Bindings: Env }>();

permissionsRoute.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return c.json({
    catalog: PERMISSION_CATALOG,
    presets: MODERATOR_PRESETS,
    defaultPermissions: DEFAULT_MODERATOR_PERMISSIONS,
  });
});

export default permissionsRoute;
