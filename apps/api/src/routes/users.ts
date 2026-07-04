import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { toPublicUser, USER_PUBLIC_FIELDS } from '../lib/users';

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

  const body = await c.req.json<{ bio?: string | null; avatarUrl?: string | null; coverUrl?: string | null }>();
  const updates: Partial<{ bio: string | null; avatarUrl: string | null; coverUrl: string | null }> = {};

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

// Get single user profile
users.get('/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

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

  const postCountRes = await db.select({ value: count() })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.userId, userId),
        sql`${schema.posts.deletedAt} IS NULL`
      )
    )
    .get();

  return c.json(toPublicUser(user, postCountRes?.value || 0));
});

export default users;
