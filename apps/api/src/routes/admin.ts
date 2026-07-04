import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { sign } from 'hono/jwt';
import type { Env } from '../types';
import { getAuthUser, JWT_SECRET } from '../lib/auth';

const admin = new Hono<{ Bindings: Env }>();

// Admin stats & user list (filtering out deleted users)
admin.get('/stats', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });

  const totalUsers = await db.select({ value: count() }).from(schema.users).where(sql`${schema.users.deletedAt} IS NULL`).get();
  const totalPosts = await db.select({ value: count() }).from(schema.posts).where(sql`${schema.posts.deletedAt} IS NULL`).get();
  const totalComments = await db.select({ value: count() }).from(schema.comments).where(sql`${schema.comments.deletedAt} IS NULL`).get();
  const totalMessages = await db.select({ value: count() }).from(schema.messages).where(sql`${schema.messages.deletedAt} IS NULL`).get();

  const allUsers = await db.select({
    id: schema.users.id,
    username: schema.users.username,
    role: schema.users.role,
    createdAt: schema.users.createdAt,
  })
  .from(schema.users)
  .where(sql`${schema.users.deletedAt} IS NULL`)
  .all();

  return c.json({
    stats: {
      users: totalUsers?.value || 0,
      posts: totalPosts?.value || 0,
      comments: totalComments?.value || 0,
      messages: totalMessages?.value || 0,
    },
    users: allUsers,
  });
});

// Admin Impersonation Endpoint
admin.post('/impersonate', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { userId } = await c.req.json<{ userId: number }>();
  if (!userId) {
    return c.json({ error: 'User ID is required' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const targetUser = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!targetUser) {
    return c.json({ error: 'User not found' }, 404);
  }
  if (targetUser.deletedAt) {
    return c.json({ error: 'Cannot impersonate a deleted user' }, 400);
  }

  // Generate delegation token for target user
  const token = await sign({ 
    id: targetUser.id, 
    username: targetUser.username, 
    role: targetUser.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: {
      id: targetUser.id,
      username: targetUser.username,
      role: targetUser.role,
      createdAt: targetUser.createdAt,
    }
  });
});

// Admin User Role Update
admin.put('/users/:id/role', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (userId === authUser.id) {
    return c.json({ error: 'Cannot change your own role' }, 400);
  }

  const { role } = await c.req.json<{ role: 'user' | 'admin' }>();
  if (role !== 'user' && role !== 'admin') {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  await db.update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ success: true });
});

// Admin User Soft Delete
admin.delete('/users/:id', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userId = parseInt(c.req.param('id'));
  if (userId === authUser.id) {
    return c.json({ error: 'Cannot delete your own admin account' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Soft delete user
  await db.update(schema.users)
    .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(schema.users.id, userId))
    .run();

  return c.json({ success: true });
});

export default admin;
