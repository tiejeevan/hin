import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import {
  DEFAULT_MODERATOR_PERMISSIONS,
  MODERATOR_PRESETS,
  type ModeratorDetail,
  type ModeratorPresetKey,
  type ModeratorSummary,
  type ModerationAuditLogEntry,
  type PermissionKey,
} from '@hin/types';
import { writeModerationAuditLog } from './moderation-audit';

type Db = ReturnType<typeof drizzle<typeof schema>>;

function resolvePresetKeys(preset: Exclude<ModeratorPresetKey, 'custom'>): PermissionKey[] {
  return [...MODERATOR_PRESETS[preset].keys];
}

async function permissionIdsByKeys(db: Db, keys: PermissionKey[]): Promise<Map<PermissionKey, number>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.permissions.id, key: schema.permissions.key })
    .from(schema.permissions)
    .where(inArray(schema.permissions.key, keys))
    .all();
  return new Map(rows.map((r) => [r.key as PermissionKey, r.id]));
}

export async function listModerators(db: Db, statusFilter?: 'active' | 'suspended'): Promise<ModeratorSummary[]> {
  const conditions = [eq(schema.users.role, 'moderator'), isNull(schema.users.deletedAt)];
  if (statusFilter) {
    conditions.push(eq(schema.users.moderatorStatus, statusFilter));
  }

  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      moderatorStatus: schema.users.moderatorStatus,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(and(...conditions))
    .orderBy(desc(schema.users.createdAt))
    .all();

  const summaries: ModeratorSummary[] = [];
  for (const u of users) {
    const permCount = await db
      .select({ value: sql<number>`count(*)` })
      .from(schema.moderatorPermissions)
      .where(eq(schema.moderatorPermissions.userId, u.id))
      .get();
    const lastActivity = await db
      .select({ createdAt: schema.moderationAuditLogs.createdAt })
      .from(schema.moderationAuditLogs)
      .where(eq(schema.moderationAuditLogs.actorId, u.id))
      .orderBy(desc(schema.moderationAuditLogs.id))
      .limit(1)
      .get();

    summaries.push({
      id: u.id,
      username: u.username,
      role: 'moderator',
      moderatorStatus: (u.moderatorStatus as ModeratorSummary['moderatorStatus']) ?? 'active',
      permissionCount: permCount?.value ?? 0,
      createdAt: u.createdAt,
      lastActivityAt: lastActivity?.createdAt ?? null,
    });
  }
  return summaries;
}

export async function getModeratorDetail(db: Db, userId: number): Promise<ModeratorDetail | null> {
  const user = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      moderatorStatus: schema.users.moderatorStatus,
      createdAt: schema.users.createdAt,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();

  if (!user || user.deletedAt || user.role !== 'moderator') return null;

  const permRows = await db
    .select({ key: schema.permissions.key })
    .from(schema.moderatorPermissions)
    .innerJoin(schema.permissions, eq(schema.moderatorPermissions.permissionId, schema.permissions.id))
    .where(eq(schema.moderatorPermissions.userId, userId))
    .all();

  const list = await listModerators(db);
  const summary = list.find((m) => m.id === userId);
  if (!summary) return null;

  return {
    ...summary,
    permissionKeys: permRows.map((r) => r.key as PermissionKey),
  };
}

export async function promoteToModerator(
  db: Db,
  adminId: number,
  userId: number,
  opts: { permissionKeys?: PermissionKey[]; preset?: Exclude<ModeratorPresetKey, 'custom'> },
): Promise<{ ok: true; detail: ModeratorDetail } | { ok: false; error: string; code: number }> {
  if (adminId === userId) {
    return { ok: false, error: 'Cannot promote yourself', code: 400 };
  }

  const target = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target || target.deletedAt) return { ok: false, error: 'User not found', code: 404 };
  if (target.role === 'admin') return { ok: false, error: 'Cannot change an admin role', code: 400 };
  if (target.role === 'moderator') return { ok: false, error: 'User is already a moderator', code: 400 };

  const keys = opts.permissionKeys?.length
    ? opts.permissionKeys
    : opts.preset
      ? resolvePresetKeys(opts.preset)
      : [...DEFAULT_MODERATOR_PERMISSIONS];

  const keyMap = await permissionIdsByKeys(db, keys);
  if (keyMap.size !== keys.length) {
    return { ok: false, error: 'Invalid permission keys', code: 400 };
  }

  await db
    .update(schema.users)
    .set({ role: 'moderator', moderatorStatus: 'active' })
    .where(eq(schema.users.id, userId))
    .run();

  const now = new Date().toISOString();
  for (const key of keys) {
    const permissionId = keyMap.get(key)!;
    await db.insert(schema.moderatorPermissions).values({
      userId,
      permissionId,
      grantedBy: adminId,
      updatedAt: now,
    }).run();
  }

  await writeModerationAuditLog(db, {
    actorId: adminId,
    actorRole: 'admin',
    action: 'moderator.promote',
    targetType: 'user',
    targetId: userId,
    afterState: { permissionKeys: keys },
  });

  const detail = await getModeratorDetail(db, userId);
  if (!detail) return { ok: false, error: 'Failed to load moderator', code: 500 };
  return { ok: true, detail };
}

export async function updateModeratorPermissions(
  db: Db,
  adminId: number,
  userId: number,
  permissionKeys: PermissionKey[],
): Promise<
  | { ok: true; added: PermissionKey[]; removed: PermissionKey[]; detail: ModeratorDetail }
  | { ok: false; error: string; code: number }
> {
  if (adminId === userId) {
    return { ok: false, error: 'Cannot modify your own permissions', code: 400 };
  }

  const target = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target || target.deletedAt) return { ok: false, error: 'User not found', code: 404 };
  if (target.role !== 'moderator') return { ok: false, error: 'User is not a moderator', code: 400 };

  const existingRows = await db
    .select({ key: schema.permissions.key, permissionId: schema.permissions.id })
    .from(schema.moderatorPermissions)
    .innerJoin(schema.permissions, eq(schema.moderatorPermissions.permissionId, schema.permissions.id))
    .where(eq(schema.moderatorPermissions.userId, userId))
    .all();

  const existing = new Set(existingRows.map((r) => r.key as PermissionKey));
  const desired = new Set(permissionKeys);
  const added = permissionKeys.filter((k) => !existing.has(k));
  const removed = [...existing].filter((k) => !desired.has(k));

  const keyMap = await permissionIdsByKeys(db, permissionKeys);
  if (keyMap.size !== permissionKeys.length) {
    return { ok: false, error: 'Invalid permission keys', code: 400 };
  }

  const now = new Date().toISOString();

  await db.delete(schema.moderatorPermissions).where(eq(schema.moderatorPermissions.userId, userId)).run();

  for (const key of permissionKeys) {
    await db.insert(schema.moderatorPermissions).values({
      userId,
      permissionId: keyMap.get(key)!,
      grantedBy: adminId,
      updatedAt: now,
    }).run();
  }

  await writeModerationAuditLog(db, {
    actorId: adminId,
    actorRole: 'admin',
    action: 'moderator.permissions.update',
    targetType: 'user',
    targetId: userId,
    beforeState: { permissionKeys: [...existing] },
    afterState: { permissionKeys, added, removed },
  });

  const detail = await getModeratorDetail(db, userId);
  if (!detail) return { ok: false, error: 'Failed to load moderator', code: 500 };
  return { ok: true, added, removed, detail };
}

export async function setModeratorStatus(
  db: Db,
  adminId: number,
  userId: number,
  status: 'active' | 'suspended',
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  if (adminId === userId) return { ok: false, error: 'Cannot modify yourself', code: 400 };
  const target = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target || target.role !== 'moderator') return { ok: false, error: 'Moderator not found', code: 404 };

  await db.update(schema.users).set({ moderatorStatus: status }).where(eq(schema.users.id, userId)).run();

  await writeModerationAuditLog(db, {
    actorId: adminId,
    actorRole: 'admin',
    action: status === 'suspended' ? 'moderator.suspend' : 'moderator.reactivate',
    targetType: 'user',
    targetId: userId,
  });

  return { ok: true };
}

export async function removeModeratorRole(
  db: Db,
  adminId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: string; code: number }> {
  if (adminId === userId) return { ok: false, error: 'Cannot modify yourself', code: 400 };
  const target = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!target || target.role !== 'moderator') return { ok: false, error: 'Moderator not found', code: 404 };

  await db.update(schema.users).set({ role: 'user', moderatorStatus: null }).where(eq(schema.users.id, userId)).run();

  await writeModerationAuditLog(db, {
    actorId: adminId,
    actorRole: 'admin',
    action: 'moderator.remove',
    targetType: 'user',
    targetId: userId,
  });

  return { ok: true };
}

export async function listModeratorActivity(
  db: Db,
  userId: number,
  cursor: number | null,
  limit = 30,
): Promise<{ logs: ModerationAuditLogEntry[]; nextCursor: number | null }> {
  const conditions = [eq(schema.moderationAuditLogs.actorId, userId)];
  if (cursor) conditions.push(sql`${schema.moderationAuditLogs.id} < ${cursor}`);

  const rows = await db
    .select()
    .from(schema.moderationAuditLogs)
    .where(and(...conditions))
    .orderBy(desc(schema.moderationAuditLogs.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const actor = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, userId)).get();

  const logs: ModerationAuditLogEntry[] = page.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorUsername: actor?.username ?? null,
    actorRole: row.actorRole,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    metadata: row.metadata,
    beforeState: row.beforeState,
    afterState: row.afterState,
    createdAt: row.createdAt,
  }));

  return { logs, nextCursor: hasMore ? page[page.length - 1].id : null };
}
