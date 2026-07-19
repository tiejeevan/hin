import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import {
  PasswordResetRequestSchema,
  PasswordResetVerifySchema,
} from '@hin/types';
import type { Env } from '../types';
import { getJwtSecret } from '../lib/auth';
import { toPublicUser, toSelfUser, seedAdminUser } from '../lib/users';
import { writeAuditLog } from '../lib/audit';
import { verifyGoogleIdToken, deriveUsernameFromGoogle } from '../lib/google-auth';
import { requireTurnstile } from '../lib/turnstile';
import { getSystemSettings } from '../lib/system-settings';
import { sendPasswordResetOtpEmail } from '../lib/email/resend';
import {
  OTP_MAX_ATTEMPTS,
  OTP_PURPOSE_PASSWORD_RESET,
  OTP_RESET_LENGTH,
  OTP_RESET_SEND_EMAIL_PER_DAY,
  OTP_RESET_SEND_EMAIL_PER_HOUR,
  OTP_RESET_SEND_IP_PER_DAY,
  OTP_RESET_SEND_IP_PER_HOUR,
  OTP_RESET_SEND_IP_PER_MINUTE,
  OTP_RESET_SEND_USER_PER_DAY,
  OTP_RESET_SEND_USER_PER_HOUR,
  OTP_RESET_VERIFY_IP_PER_DAY,
  OTP_RESET_VERIFY_IP_PER_HOUR,
  codesMatch,
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  otpExpiresAt,
} from '../lib/otp';
import { clientIpFromRequest, consumeRateLimit } from '../lib/rate-limit';

const auth = new Hono<{ Bindings: Env }>();

auth.get('/turnstile-config', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const settings = await getSystemSettings(db);
  const turnstileEnabled = settings.turnstileEnabled && !!c.env.TURNSTILE_SECRET_KEY;
  return c.json({ turnstileEnabled });
});

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

async function issueAuthToken(
  user: { id: number; username: string; role: string },
  jwtSecret: string,
) {
  return sign({
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  }, jwtSecret, 'HS256');
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
    turnstileToken?: string;
  }>();
  const { username, password, clientLocalTime, sessionId, turnstileToken } = body;

  const turnstileError = await requireTurnstile(c, turnstileToken, {
    eventType: 'register',
    clientLocalTime,
    sessionId,
  });
  if (turnstileError) return turnstileError;

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
  const token = await issueAuthToken(inserted, getJwtSecret(c.env));

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
    turnstileToken?: string;
  }>();
  const { username, password, clientLocalTime, sessionId, turnstileToken } = body;

  const turnstileError = await requireTurnstile(c, turnstileToken, {
    eventType: 'failed_login',
    clientLocalTime,
    sessionId,
  });
  if (turnstileError) return turnstileError;

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
  const token = await issueAuthToken(user, getJwtSecret(c.env));

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

  const googleEmail = payload.email?.trim().toLowerCase() || null;
  let emailAvailable = false;
  if (googleEmail) {
    const emailOwner = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, googleEmail))
      .get();
    emailAvailable = !emailOwner || (!!user && emailOwner.id === user.id);
  }

  if (!user) {
    const cf = (c.req.raw as any).cf;
    const country = (cf?.country as string) ?? null;
    const username = await uniqueUsername(
      db,
      deriveUsernameFromGoogle(payload.email, payload.name),
    );

    const nowIso = new Date().toISOString();
    const [inserted] = await db.insert(schema.users).values({
      username,
      passwordHash: '',
      role: 'user',
      googleId: payload.sub,
      avatarUrl: payload.picture ?? null,
      country,
      ...(emailAvailable && googleEmail
        ? { email: googleEmail, emailVerifiedAt: nowIso }
        : {}),
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
  } else {
    const updates: Partial<{
      avatarUrl: string | null;
      email: string;
      emailVerifiedAt: string;
    }> = {};

    if (payload.picture && !user.avatarUrl) {
      updates.avatarUrl = payload.picture;
    }

    // Persist Google-verified email when the account lacks a verified email.
    if (emailAvailable && googleEmail && !user.emailVerifiedAt) {
      updates.email = googleEmail;
      updates.emailVerifiedAt = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      const [updated] = await db.update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, user.id))
        .returning();
      user = updated;
    }
  }

  const token = await issueAuthToken(user, getJwtSecret(c.env));

  await writeAuditLog(c, {
    userId: user.id,
    eventType: isNewUser ? 'register' : 'login',
    success: true,
    clientLocalTime,
    sessionId,
  });

  return c.json({
    token,
    user: toSelfUser(user),
    isNewUser,
  });
});

// ---------------------------------------------------------------------------
// Password reset (unauthenticated OTP via verified email)
// ---------------------------------------------------------------------------

auth.post('/password-reset/request', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const body = await c.req.json().catch(() => null);
  const parsed = PasswordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const turnstileError = await requireTurnstile(c, parsed.data.turnstileToken, {
    eventType: 'failed_login',
    clientLocalTime: parsed.data.clientLocalTime,
    sessionId: parsed.data.sessionId,
  });
  if (turnstileError) return turnstileError;

  // Always return generic success to avoid account enumeration.
  const genericOk = () => c.json({ ok: true });

  const apiKey = c.env.RESEND_API_KEY;
  const from = c.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    // Still generic — do not reveal config gaps to attackers.
    return genericOk();
  }

  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';

  // Rate-limit request attempts by IP before lookup.
  const ipMinute = await consumeRateLimit(db, `pwd_reset_send:ip:${ip}:m`, OTP_RESET_SEND_IP_PER_MINUTE, 60);
  if (!ipMinute.ok) return genericOk();
  const ipHour = await consumeRateLimit(db, `pwd_reset_send:ip:${ip}:h`, OTP_RESET_SEND_IP_PER_HOUR, 3600);
  if (!ipHour.ok) return genericOk();
  const ipDay = await consumeRateLimit(db, `pwd_reset_send:ip:${ip}:d`, OTP_RESET_SEND_IP_PER_DAY, 86400);
  if (!ipDay.ok) return genericOk();

  let user: typeof schema.users.$inferSelect | undefined;

  if (parsed.data.email?.trim()) {
    const email = normalizeEmail(parsed.data.email);
    user = await db.select().from(schema.users)
      .where(and(eq(schema.users.email, email), sql`${schema.users.deletedAt} IS NULL`))
      .get();
  } else if (parsed.data.username?.trim()) {
    user = await db.select().from(schema.users)
      .where(and(
        eq(schema.users.username, parsed.data.username.trim()),
        sql`${schema.users.deletedAt} IS NULL`,
      ))
      .get();
  }

  if (
    !user ||
    !user.email ||
    !user.emailVerifiedAt ||
    !user.passwordHash
  ) {
    return genericOk();
  }

  const email = normalizeEmail(user.email);

  const userHour = await consumeRateLimit(
    db,
    `pwd_reset_send:user:${user.id}:h`,
    OTP_RESET_SEND_USER_PER_HOUR,
    3600,
  );
  if (!userHour.ok) return genericOk();
  const userDay = await consumeRateLimit(
    db,
    `pwd_reset_send:user:${user.id}:d`,
    OTP_RESET_SEND_USER_PER_DAY,
    86400,
  );
  if (!userDay.ok) return genericOk();
  const emailHour = await consumeRateLimit(
    db,
    `pwd_reset_send:email:${email}:h`,
    OTP_RESET_SEND_EMAIL_PER_HOUR,
    3600,
  );
  if (!emailHour.ok) return genericOk();
  const emailDay = await consumeRateLimit(
    db,
    `pwd_reset_send:email:${email}:d`,
    OTP_RESET_SEND_EMAIL_PER_DAY,
    86400,
  );
  if (!emailDay.ok) return genericOk();

  // Invalidate prior unused reset challenges for this user.
  await db.update(schema.otpChallenges)
    .set({ consumedAt: new Date().toISOString() })
    .where(and(
      eq(schema.otpChallenges.userId, user.id),
      eq(schema.otpChallenges.purpose, OTP_PURPOSE_PASSWORD_RESET),
      isNull(schema.otpChallenges.consumedAt),
    ))
    .run();

  const code = generateOtpCode(OTP_RESET_LENGTH);
  const codeHash = await hashOtpCode(code, c.env.OTP_PEPPER);

  await db.insert(schema.otpChallenges).values({
    purpose: OTP_PURPOSE_PASSWORD_RESET,
    userId: user.id,
    email,
    codeHash,
    attempts: 0,
    expiresAt: otpExpiresAt(),
    ipAddress: ip === 'unknown' ? null : ip,
  }).run();

  await sendPasswordResetOtpEmail({
    apiKey,
    from,
    to: email,
    code,
  });

  return genericOk();
});

auth.post('/password-reset/verify', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const body = await c.req.json().catch(() => null);
  const parsed = PasswordResetVerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';
  const verifyHour = await consumeRateLimit(
    db,
    `pwd_reset_verify:ip:${ip}:h`,
    OTP_RESET_VERIFY_IP_PER_HOUR,
    3600,
  );
  if (!verifyHour.ok) {
    return c.json({ error: 'Too many attempts. Try again later.' }, 429);
  }
  const verifyDay = await consumeRateLimit(
    db,
    `pwd_reset_verify:ip:${ip}:d`,
    OTP_RESET_VERIFY_IP_PER_DAY,
    86400,
  );
  if (!verifyDay.ok) {
    return c.json({ error: 'Too many attempts. Try again later.' }, 429);
  }

  let user: typeof schema.users.$inferSelect | undefined;
  if (parsed.data.email?.trim()) {
    const email = normalizeEmail(parsed.data.email);
    user = await db.select().from(schema.users)
      .where(and(eq(schema.users.email, email), sql`${schema.users.deletedAt} IS NULL`))
      .get();
  } else if (parsed.data.username?.trim()) {
    user = await db.select().from(schema.users)
      .where(and(
        eq(schema.users.username, parsed.data.username.trim()),
        sql`${schema.users.deletedAt} IS NULL`,
      ))
      .get();
  }

  if (!user || !user.email || !user.emailVerifiedAt || !user.passwordHash) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const challenge = await db.select().from(schema.otpChallenges)
    .where(and(
      eq(schema.otpChallenges.userId, user.id),
      eq(schema.otpChallenges.purpose, OTP_PURPOSE_PASSWORD_RESET),
      eq(schema.otpChallenges.email, normalizeEmail(user.email)),
      isNull(schema.otpChallenges.consumedAt),
    ))
    .orderBy(desc(schema.otpChallenges.createdAt))
    .get();

  if (!challenge) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  if (challenge.expiresAt <= new Date().toISOString()) {
    await db.update(schema.otpChallenges)
      .set({ consumedAt: new Date().toISOString() })
      .where(eq(schema.otpChallenges.id, challenge.id))
      .run();
    return c.json({ error: 'Code expired. Request a new one.' }, 400);
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return c.json({ error: 'Too many incorrect attempts. Request a new code.' }, 400);
  }

  const match = await codesMatch(parsed.data.code, challenge.codeHash, c.env.OTP_PEPPER);
  if (!match) {
    await db.update(schema.otpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(schema.otpChallenges.id, challenge.id))
      .run();
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const now = new Date().toISOString();

  await db.update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, user.id))
    .run();

  await db.update(schema.otpChallenges)
    .set({ consumedAt: now })
    .where(eq(schema.otpChallenges.id, challenge.id))
    .run();

  // Invalidate any sibling unused reset challenges.
  await db.update(schema.otpChallenges)
    .set({ consumedAt: now })
    .where(and(
      eq(schema.otpChallenges.userId, user.id),
      eq(schema.otpChallenges.purpose, OTP_PURPOSE_PASSWORD_RESET),
      isNull(schema.otpChallenges.consumedAt),
    ))
    .run();

  await writeAuditLog(c, {
    userId: user.id,
    eventType: 'password_reset',
    success: true,
  });

  return c.json({ ok: true });
});

export default auth;

