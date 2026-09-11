import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql, or, like, isNull, gt, asc } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { toPublicUser, toSelfUser, USER_PUBLIC_FIELDS, USER_SELF_FIELDS, buildProfileResponse } from '../lib/users';
import {
  getOrCreateUserSettings,
  ensureUserSettingsRow,
  settingsRowUpdatesFromPatch,
} from '../lib/user-settings';
import { UpdateUserSettingsSchema, DeleteAccountSchema, ChangePasswordSchema } from '@hin/types';
import { validatePassword } from '../lib/auth-validation';
import { getSystemSettings } from '../lib/system-settings';
import { softDeleteUser, verifyPassword } from '../lib/user-lifecycle';
import { toGamificationPublic, emptyGamificationPublic } from '../lib/gamification/public';
import { isGamificationEnabled } from '../lib/gamification/settings';
import { loadEquippedBadgesForUsers } from '../lib/gamification/equipped';
import { writeAuditLog, softDeleteUserAuditLogs } from '../lib/audit';
import { deferBroadcast } from '../lib/realtime';
import { bulkUpdateSharePreviewsForPrivacyChange } from '../lib/sharePreview';
import { refreshPostSharePreviewsForUserSafe } from '../lib/sharePreviewHooks';
import bcrypt from 'bcryptjs';

const users = new Hono<{ Bindings: Env }>();

const USERS_LIST_DEFAULT_LIMIT = 500;
const USERS_LIST_MAX_LIMIT = 1000;

// Get users (paginated; default first page preserves array response shape)
users.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const cursorParam = c.req.query('cursor');
  const limitParam = c.req.query('limit');
  const cursor = cursorParam !== undefined ? parseInt(cursorParam, 10) : 0;
  const limit = limitParam !== undefined
    ? Math.min(Math.max(parseInt(limitParam, 10) || USERS_LIST_DEFAULT_LIMIT, 1), USERS_LIST_MAX_LIMIT)
    : USERS_LIST_DEFAULT_LIMIT;

  if (Number.isNaN(cursor) || cursor < 0) {
    return c.json({ error: 'Invalid cursor' }, 400);
  }

  const rows = await db.select(USER_PUBLIC_FIELDS)
    .from(schema.users)
    .where(
      and(
        isNull(schema.users.deletedAt),
        cursor > 0 ? gt(schema.users.id, cursor) : sql`1=1`,
      ),
    )
    .orderBy(asc(schema.users.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const usersPayload = pageRows.map(u => toPublicUser(u));

  if (cursorParam !== undefined || limitParam !== undefined) {
    return c.json({
      users: usersPayload,
      nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
    });
  }

  return c.json(usersPayload);
});

// Update own profile (registered before /:id so "me" is not captured as an id)
users.patch('/me', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    dateOfBirth?: string | null;
  }>();
  const updates: Partial<{
    bio: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    profileCompletedAt: string | null;
  }> = {};

  if (body.bio !== undefined) {
    if (body.bio !== null && body.bio.length > 500) {
      return c.json({ error: 'Bio is too long (max 500 characters)' }, 400);
    }
    updates.bio = body.bio === null ? null : body.bio.trim();
  }
  if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;
  if (body.coverUrl !== undefined) updates.coverUrl = body.coverUrl;

  if (body.firstName !== undefined) {
    updates.firstName = body.firstName === null ? null : body.firstName.trim();
  }
  if (body.lastName !== undefined) {
    updates.lastName = body.lastName === null ? null : body.lastName.trim();
  }
  if (body.dateOfBirth !== undefined) {
    const dob = body.dateOfBirth === null ? null : body.dateOfBirth.trim();
    if (dob !== null && dob !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        return c.json({ error: 'Birthday must be in YYYY-MM-DD format' }, 400);
      }
    }
    updates.dateOfBirth = dob || null;
  }

  // Auto-complete profile walkthrough status if fields are now complete
  const currentFirstName = updates.firstName !== undefined ? updates.firstName : authUser.firstName;
  const currentLastName = updates.lastName !== undefined ? updates.lastName : authUser.lastName;
  const currentDateOfBirth = updates.dateOfBirth !== undefined ? updates.dateOfBirth : authUser.dateOfBirth;

  if (currentFirstName && currentLastName && currentDateOfBirth && !authUser.profileCompletedAt) {
    updates.profileCompletedAt = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [updated] = await db.update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, authUser.id))
    .returning();

  await refreshProfileSharePreviewSafe(db, authUser.id, c.env, new URL(c.req.url).origin);

  return c.json(toSelfUser(updated));
});

users.post('/me/password', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const { currentPassword, newPassword } = parsed.data;
  const db = drizzle(c.env.DB, { schema });

  if (!authUser.passwordHash) {
    return c.json({
      error: 'This account uses Google sign-in and has no password to change',
    }, 403);
  }

  const ok = await verifyPassword(db, authUser.id, currentPassword);
  if (!ok) {
    return c.json({ error: 'Current password is incorrect' }, 400);
  }

  if (currentPassword === newPassword) {
    return c.json({ error: 'New password must be different from the current password' }, 400);
  }

  const settings = await getSystemSettings(db);
  const passwordError = validatePassword(newPassword, settings.strictPasswordRequirements);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, authUser.id))
    .run();

  await writeAuditLog(c, {
    userId: authUser.id,
    eventType: 'password_change',
    success: true,
  });

  return c.json({ ok: true });
});

users.get('/me/settings', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const settings = await getOrCreateUserSettings(db, authUser.id);
  return c.json(settings);
});

users.patch('/me/settings', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  const parsed = UpdateUserSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message ?? 'Invalid settings' }, 400);
  }

  const patch = parsed.data;
  const db = drizzle(c.env.DB, { schema });

  if (patch.isPrivate !== undefined) {
    await db.update(schema.users)
      .set({ isPrivate: patch.isPrivate ? 1 : 0 })
      .where(eq(schema.users.id, authUser.id));
  }

  const rowUpdates = settingsRowUpdatesFromPatch(patch);
  if (Object.keys(rowUpdates).length > 0) {
    await ensureUserSettingsRow(db, authUser.id);
    await db.update(schema.userSettings)
      .set({ ...rowUpdates, updatedAt: new Date().toISOString() })
      .where(eq(schema.userSettings.userId, authUser.id));
  }

  if (patch.isPrivate === undefined && Object.keys(rowUpdates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  const settings = await getOrCreateUserSettings(db, authUser.id);

  if (patch.isPrivate !== undefined) {
    const origin = new URL(c.req.url).origin;
    await bulkUpdateSharePreviewsForPrivacyChange(
      db,
      authUser.id,
      !!patch.isPrivate,
      c.env,
      origin,
    );
    deferBroadcast(
      c.executionCtx,
      refreshPostSharePreviewsForUserSafe(db, authUser.id, c.env, origin),
    );
  }

  return c.json(settings);
});

users.delete('/me', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  if (authUser.role === 'admin') {
    return c.json({ error: 'Admin accounts cannot be self-deleted' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = DeleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const passwordValid = await verifyPassword(db, authUser.id, parsed.data.password);
  if (!passwordValid) {
    return c.json({ error: 'Incorrect password' }, 401);
  }

  const result = await softDeleteUser(db, authUser.id, 'self');
  if (!result.ok) {
    return c.json({ error: result.error }, result.code as 400 | 404);
  }

  // Audit: user deleted their own account
  await writeAuditLog(c, {
    userId: authUser.id,
    eventType: 'account_delete',
    success: true,
  });
  // Soft-delete all this user's audit logs (will be hard-purged after 90 days)
  await softDeleteUserAuditLogs(c, authUser.id);

  await refreshProfileSharePreviewSafe(db, authUser.id, c.env, new URL(c.req.url).origin);

  return c.json({ success: true });
});

// Search users by matching query, prioritizing followed and interacted users
users.get('/search', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const q = c.req.query('q') || '';
  if (q.length < 2) return c.json([]);

  const db = drizzle(c.env.DB, { schema });
  const queryPattern = `%${q}%`;

  try {
    // 1. Fetch matching users (excluding soft-deleted and self)
    const matchingUsers = await db.select(USER_PUBLIC_FIELDS)
      .from(schema.users)
      .where(
        and(
          like(schema.users.username, queryPattern),
          isNull(schema.users.deletedAt),
          sql`${schema.users.id} != ${authUser.id}`
        )
      )
      .all();

    if (matchingUsers.length === 0) return c.json([]);

    // 2. Fetch followed user IDs to prioritize them
    const followed = await db.select({ followingId: schema.userFollows.followingId })
      .from(schema.userFollows)
      .where(
        and(
          eq(schema.userFollows.followerId, authUser.id),
          isNull(schema.userFollows.deletedAt)
        )
      )
      .all();
    const followedSet = new Set(followed.map(f => f.followingId));

    const partnerRows = await db.select({
      partnerId: sql<number>`CASE
        WHEN ${schema.messages.senderId} = ${authUser.id} THEN ${schema.messages.receiverId}
        ELSE ${schema.messages.senderId}
      END`.as('partner_id'),
    })
      .from(schema.messages)
      .where(
        and(
          or(
            eq(schema.messages.senderId, authUser.id),
            eq(schema.messages.receiverId, authUser.id),
          ),
          isNull(schema.messages.deletedAt),
        ),
      )
      .groupBy(sql`partner_id`)
      .all();

    const interactedSet = new Set(partnerRows.map((r) => r.partnerId));

    // 4. Sort: followed first, then interacted, then alphabetical
    const equippedBadgesByUser = (await isGamificationEnabled(db))
      ? await loadEquippedBadgesForUsers(db, matchingUsers.map(u => u.id))
      : new Map();

    const sorted = matchingUsers.map(u => {
      const publicUser = toPublicUser(u, { equippedBadges: equippedBadgesByUser.get(u.id) ?? [] });
      return {
        ...publicUser,
        isFollowing: followedSet.has(u.id),
        hasInteracted: interactedSet.has(u.id)
      };
    })
    .sort((a, b) => {
      if (a.isFollowing && !b.isFollowing) return -1;
      if (!a.isFollowing && b.isFollowing) return 1;

      if (a.hasInteracted && !b.hasInteracted) return -1;
      if (!a.hasInteracted && b.hasInteracted) return 1;

      return a.username.localeCompare(b.username);
    });

    // Limit to top 10 results
    return c.json(sorted.slice(0, 10));
  } catch (e) {
    console.error('Error searching users:', e);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

// Get user by username
users.get('/username/:username', async (c) => {
  const authUser = await getAuthUser(c);
  const viewerId = authUser ? authUser.id : null;

  const db = drizzle(c.env.DB, { schema });
  const username = c.req.param('username');

  try {
    const candidate = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.username, username),
          isNull(schema.users.deletedAt)
        )
      )
      .get();

    if (!candidate) return c.json({ error: 'User not found' }, 404);

    const isSelf = viewerId === candidate.id;
    const user = await db.select(isSelf ? USER_SELF_FIELDS : USER_PUBLIC_FIELDS)
      .from(schema.users)
      .where(eq(schema.users.id, candidate.id))
      .get();

    if (!user) return c.json({ error: 'User not found' }, 404);

    const profile = await buildProfileResponse(db, viewerId, user);
    if (!profile) return c.json({ error: 'User not found' }, 404);
    return c.json(profile);
  } catch (e) {
    console.error('Error fetching user by username:', e);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

users.get('/:id/gamification', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const userId = parseInt(c.req.param('id'), 10);
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), isNull(schema.users.deletedAt)))
    .get();

  if (!user) return c.json({ error: 'User not found' }, 404);

  if (!(await isGamificationEnabled(db))) {
    return c.json(emptyGamificationPublic());
  }

  const isSelf = authUser.id === userId;
  const gamification = await toGamificationPublic(db, userId, { includeGoals: isSelf });
  return c.json(gamification);
});

// Get single user profile
users.get('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  const viewerId = authUser ? authUser.id : null;

  const db = drizzle(c.env.DB, { schema });
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const isSelf = viewerId === userId;
  const user = await db.select(isSelf ? USER_SELF_FIELDS : USER_PUBLIC_FIELDS)
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        sql`${schema.users.deletedAt} IS NULL`
      )
    )
    .get();

  if (!user) return c.json({ error: 'User not found' }, 404);

  const profile = await buildProfileResponse(db, viewerId, user);
  if (!profile) return c.json({ error: 'User not found' }, 404);
  return c.json(profile);
});

export default users;
