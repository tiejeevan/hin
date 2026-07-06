import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql, or, like, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { toPublicUser, USER_PUBLIC_FIELDS, buildProfileResponse } from '../lib/users';
import {
  getOrCreateUserSettings,
  ensureUserSettingsRow,
  settingsRowUpdatesFromPatch,
} from '../lib/user-settings';
import { UpdateUserSettingsSchema } from '@hin/types';

const users = new Hono<{ Bindings: Env }>();

// Get all users (for chat list and user details)
users.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const allUsers = await db.select(USER_PUBLIC_FIELDS)
  .from(schema.users)
  .where(sql`${schema.users.deletedAt} IS NULL`) // Skip soft deleted users
  .all();

  return c.json(allUsers.map(u => toPublicUser(u)));
});

// Update own profile (registered before /:id so "me" is not captured as an id)
users.patch('/me', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{
    bio?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
  }>();
  const updates: Partial<{
    bio: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
  }> = {};

  if (body.bio !== undefined) {
    if (body.bio !== null && body.bio.length > 500) {
      return c.json({ error: 'Bio is too long (max 500 characters)' }, 400);
    }
    updates.bio = body.bio === null ? null : body.bio.trim();
  }
  if (body.avatarUrl !== undefined) updates.avatarUrl = body.avatarUrl;
  if (body.coverUrl !== undefined) updates.coverUrl = body.coverUrl;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const [updated] = await db.update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, authUser.id))
    .returning();

  return c.json(toPublicUser(updated));
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
  return c.json(settings);
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

    // 3. Fetch interacted users from messages
    const interactions = await db.select({
      senderId: schema.messages.senderId,
      receiverId: schema.messages.receiverId
    })
    .from(schema.messages)
    .where(
      and(
        or(
          eq(schema.messages.senderId, authUser.id),
          eq(schema.messages.receiverId, authUser.id)
        ),
        isNull(schema.messages.deletedAt)
      )
    )
    .all();

    const interactedSet = new Set<number>();
    for (const m of interactions) {
      if (m.senderId !== authUser.id) interactedSet.add(m.senderId);
      if (m.receiverId !== authUser.id) interactedSet.add(m.receiverId);
    }

    // 4. Sort: followed first, then interacted, then alphabetical
    const sorted = matchingUsers.map(u => {
      const publicUser = toPublicUser(u);
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
    const user = await db.select(USER_PUBLIC_FIELDS)
      .from(schema.users)
      .where(
        and(
          eq(schema.users.username, username),
          isNull(schema.users.deletedAt)
        )
      )
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

// Get single user profile
users.get('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  const viewerId = authUser ? authUser.id : null;

  const db = drizzle(c.env.DB, { schema });
  const userId = parseInt(c.req.param('id'));
  if (isNaN(userId)) return c.json({ error: 'Invalid user id' }, 400);

  const user = await db.select(USER_PUBLIC_FIELDS)
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
