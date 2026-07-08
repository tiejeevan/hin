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
import { verifyGoogleIdToken, deriveUsernameFromGoogle } from '../lib/google-auth';

const auth = new Hono<{ Bindings: Env }>();

async function uniqueUsername(
  db: ReturnType<typeof drizzle<typeof schema>>,
  base: string,
): Promise<string> {
  let candidate = base;
  let suffix = 0;
  while (true) {
    const existing = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, candidate))
      .get();
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 40);
  }
}

async function issueAuthToken(user: { id: number; username: string; role: string }) {
  return sign({
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  }, JWT_SECRET, 'HS256');
}

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
  const token = await issueAuthToken(inserted);

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
  const token = await issueAuthToken(user);

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

// Google Sign-In (verifies Google ID token, creates or logs in user)
auth.post('/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: 'Google sign-in is not configured' }, 503);
  }

  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db);

  const body = await c.req.json<{
    credential?: string;
    clientLocalTime?: string;
    sessionId?: string;
  }>();
  const { credential, clientLocalTime, sessionId } = body;

  if (!credential) {
    return c.json({ error: 'Google credential is required' }, 400);
  }

  const payload = await verifyGoogleIdToken(credential, clientId);
  if (!payload) {
    await writeAuditLog(c, {
      eventType: 'failed_login',
      success: false,
      failureReason: 'invalid_google_token',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'Invalid Google sign-in token' }, 401);
  }

  let user = await db.select().from(schema.users)
    .where(eq(schema.users.googleId, payload.sub))
    .get();

  let isNewUser = false;

  if (!user) {
    const cf = (c.req.raw as any).cf;
    const country = (cf?.country as string) ?? null;
    const username = await uniqueUsername(
      db,
      deriveUsernameFromGoogle(payload.email, payload.name),
    );

    const [inserted] = await db.insert(schema.users).values({
      username,
      passwordHash: '',
      role: 'user',
      googleId: payload.sub,
      avatarUrl: payload.picture ?? null,
      country,
    }).returning();

    await db.insert(schema.userSettings).values({ userId: inserted.id });
    user = inserted;
    isNewUser = true;
  } else if (user.deletedAt) {
    await writeAuditLog(c, {
      userId: user.id,
      eventType: 'failed_login',
      success: false,
      failureReason: 'account_deleted',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'This account has been deleted' }, 401);
  } else if (payload.picture && !user.avatarUrl) {
    await db.update(schema.users)
      .set({ avatarUrl: payload.picture })
      .where(eq(schema.users.id, user.id))
      .run();
    user = { ...user, avatarUrl: payload.picture };
  }

  const token = await issueAuthToken(user);

  await writeAuditLog(c, {
    userId: user.id,
    eventType: isNewUser ? 'register' : 'login',
    success: true,
    clientLocalTime,
    sessionId,
  });

  return c.json({
    token,
    user: toPublicUser(user),
    isNewUser,
  });
});

export default auth;

