import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import type { Env } from '../types';
import { JWT_SECRET } from '../lib/auth';
import { toPublicUser, seedAdminUser } from '../lib/users';
import { writeAuditLog } from '../lib/audit';

const auth = new Hono<{ Bindings: Env }>();

// Register
auth.post('/register', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db); // Seed admin user if not exists

  const body = await c.req.json<{
    username?: string;
    password?: string;
    clientLocalTime?: string;
    sessionId?: string;
  }>();
  const { username, password, clientLocalTime, sessionId } = body;
  
  if (!username || username.trim() === '') {
    return c.json({ error: 'Username is required' }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const normalizedUsername = username.trim();

  // Check if exists (case-sensitive)
  const existing = await db.select().from(schema.users).where(eq(schema.users.username, normalizedUsername)).get();
  if (existing) {
    await writeAuditLog(c, {
      eventType: 'register',
      success: false,
      failureReason: 'username_taken',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'Username already taken' }, 400);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Insert user
  const cf = (c.req.raw as any).cf;
  const country = (cf?.country as string) ?? null;

  const [inserted] = await db.insert(schema.users).values({
    username: normalizedUsername,
    passwordHash,
    role: 'user',
    country,
  }).returning();

  await db.insert(schema.userSettings).values({ userId: inserted.id });

  // Generate JWT token
  const token = await sign({ 
    id: inserted.id, 
    username: inserted.username, 
    role: inserted.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  // Audit: successful register
  await writeAuditLog(c, {
    userId: inserted.id,
    eventType: 'register',
    success: true,
    clientLocalTime,
    sessionId,
  });

  return c.json({
    token,
    user: toPublicUser(inserted),
  });
});

// Login
auth.post('/login', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db); // Seed admin user if not exists

  const body = await c.req.json<{
    username?: string;
    password?: string;
    clientLocalTime?: string;
    sessionId?: string;
  }>();
  const { username, password, clientLocalTime, sessionId } = body;
  
  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const normalizedUsername = username.trim();

  // Find user (case-sensitive; filtering out soft deleted ones)
  const user = await db.select().from(schema.users)
    .where(eq(schema.users.username, normalizedUsername))
    .get();

  if (!user) {
    await writeAuditLog(c, {
      eventType: 'failed_login',
      success: false,
      failureReason: 'user_not_found',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  if (user.deletedAt) {
    await writeAuditLog(c, {
      userId: user.id,
      eventType: 'failed_login',
      success: false,
      failureReason: 'account_deleted',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Compare passwords
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    await writeAuditLog(c, {
      userId: user.id,
      eventType: 'failed_login',
      success: false,
      failureReason: 'bad_password',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Generate JWT token
  const token = await sign({ 
    id: user.id, 
    username: user.username, 
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  }, JWT_SECRET, 'HS256');

  // Audit: successful login
  await writeAuditLog(c, {
    userId: user.id,
    eventType: 'login',
    success: true,
    clientLocalTime,
    sessionId,
  });

  return c.json({
    token,
    user: toPublicUser(user),
  });
});

// Logout (client-side token discard; server records the event for audit trail)
auth.post('/logout', async (c) => {
  type LogoutBody = { userId?: number; clientLocalTime?: string; sessionId?: string };
  const defaultBody: LogoutBody = {};
  const body: LogoutBody = await c.req.json<LogoutBody>().catch(() => defaultBody);

  await writeAuditLog(c, {
    userId: body.userId ?? null,
    eventType: 'logout',
    success: true,
    clientLocalTime: body.clientLocalTime,
    sessionId: body.sessionId,
  });

  return c.json({ success: true });
});

export default auth;

