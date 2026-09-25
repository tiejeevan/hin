import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { PermissionKey } from '@hin/types';
import type { Context } from 'hono';
import type { Env } from '../types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type AppVariables = {
  permissions?: PermissionsResult;
};

export type PermissionsResult = Set<PermissionKey> | 'all';

type AuthUserRow = {
  id: number;
  role: string;
  moderatorStatus?: string | null;
};

export async function loadPermissionKeysForModerator(db: Db, userId: number): Promise<Set<PermissionKey>> {
  const rows = await db
    .select({ key: schema.permissions.key })
    .from(schema.moderatorPermissions)
    .innerJoin(schema.permissions, eq(schema.moderatorPermissions.permissionId, schema.permissions.id))
    .where(eq(schema.moderatorPermissions.userId, userId))
    .all();
  return new Set(rows.map((r) => r.key as PermissionKey));
}

export async function getUserPermissions(db: Db, user: AuthUserRow): Promise<PermissionsResult> {
  if (user.role === 'admin') return 'all';
  if (user.role !== 'moderator') return new Set();
  if (user.moderatorStatus === 'suspended') return new Set();
  return loadPermissionKeysForModerator(db, user.id);
}

export function permissionsToArray(perms: PermissionsResult): PermissionKey[] | 'all' {
  if (perms === 'all') return 'all';
  return [...perms];
}

export function hasPermissionInSet(perms: PermissionsResult, key: PermissionKey): boolean {
  if (perms === 'all') return true;
  return perms.has(key);
}

export async function resolvePermissions(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  db: Db,
  user: AuthUserRow,
): Promise<PermissionsResult> {
  const cached = c.get('permissions');
  if (cached !== undefined) return cached;
  const perms = await getUserPermissions(db, user);
  c.set('permissions', perms);
  return perms;
}

export async function hasPermission(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  db: Db,
  user: AuthUserRow,
  key: PermissionKey,
): Promise<boolean> {
  const perms = await resolvePermissions(c, db, user);
  return hasPermissionInSet(perms, key);
}

export async function hasAnyPermission(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  db: Db,
  user: AuthUserRow,
  keys: PermissionKey[],
): Promise<boolean> {
  const perms = await resolvePermissions(c, db, user);
  if (perms === 'all') return true;
  return keys.some((k) => perms.has(k));
}

export async function hasAllPermissions(
  c: Context<{ Bindings: Env; Variables: AppVariables }>,
  db: Db,
  user: AuthUserRow,
  keys: PermissionKey[],
): Promise<boolean> {
  const perms = await resolvePermissions(c, db, user);
  if (perms === 'all') return true;
  return keys.every((k) => perms.has(k));
}
