import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import type { Env } from '../types';
import { JWT_SECRET } from '../lib/auth';
import { toPublicUser, seedAdminUser } from '../lib/users';

const auth = new Hono<{ Bindings: Env }>();

// Register
auth.post('/register', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db); // Seed admin user if not exists

  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  
  if (!username || username.trim() === '') {
    return c.json({ error: 'Username is required' }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const normalizedUsername = username.trim().toLowerCase();

  // Check if exists
  const existing = await db.select().from(schema.users).where(eq(schema.users.username, normalizedUsername)).get();
  if (existing) {
    return c.json({ error: 'Username already taken' }, 400);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Insert user
  const [inserted] = await db.insert(schema.users).values({
    username: normalizedUsername,
    passwordHash,
    role: 'user',
  }).returning();

  // Generate JWT token
  const token = await sign({ 
    id: inserted.id, 
    username: inserted.username, 
    role: inserted.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: toPublicUser(inserted),
  });
});

// Login
auth.post('/login', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db); // Seed admin user if not exists

  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  
  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const normalizedUsername = username.trim().toLowerCase();

  // Find user (filtering out soft deleted ones)
  const user = await db.select().from(schema.users)
    .where(
      and(
        eq(schema.users.username, normalizedUsername),
        sql`${schema.users.deletedAt} IS NULL`
      )
    )
    .get();

  if (!user) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Compare passwords
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Generate JWT token
  const token = await sign({ 
    id: user.id, 
    username: user.username, 
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  return c.json({
    token,
    user: toPublicUser(user),
  });
});

export default auth;
