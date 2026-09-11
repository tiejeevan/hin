import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import bcrypt from 'bcryptjs';
import { sign } from 'hono/jwt';
import {
  CompleteUsernameSchema,
  PasswordResetRequestSchema,
  PasswordResetVerifySchema,
  VerifyRegistrationSchema,
} from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getJwtSecret, JWT_SECRET_DEV_FALLBACK } from '../lib/auth';
import { toPublicUser, toSelfUser, seedAdminUser } from '../lib/users';
import { writeAuditLog } from '../lib/audit';
import { verifyGoogleIdToken } from '../lib/google-auth';
import { requireTurnstile } from '../lib/turnstile';
import { getSystemSettings } from '../lib/system-settings';
import { sendPasswordResetOtpEmail } from '../lib/email/resend';
import { getOutboundFromEmail } from '../lib/email/outbound-from';
import {
  registrationOtpFailureReason,
  sendRegistrationVerificationOtp,
} from '../lib/email/verification-otp';
import {
  createRegistrationAccount,
  logRegistrationFailure,
  type RegistrationFailureReason,
} from '../lib/registration';
import {
  checkEmailAvailableForRegistration,
  checkGoogleEmailCollision,
  isUsernameAvailable,
  normalizeUsername,
  provisionalUsername,
  validatePassword,
  validateUsernameFormat,
} from '../lib/auth-validation';
import { getAccountBlockReason } from '../lib/account-guard';
import {
  OTP_MAX_ATTEMPTS,
  OTP_PURPOSE_EMAIL_VERIFY,
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
  OTP_VERIFY_IP_PER_DAY,
  OTP_VERIFY_IP_PER_HOUR,
  codesMatch,
  generateOtpCode,
  hashOtpCode,
  normalizeEmail,
  otpExpiresAt,
} from '../lib/otp';
import { clientIpFromRequest, consumeRateLimit, refundRateLimit } from '../lib/rate-limit';
import {
  buildBucketKey,
  resolveClientIp,
} from '../lib/rate-limit-policy';
import {
  createAuthRouteRateLimit,
  enforceRateLimit,
  rateLimitExceeded,
} from '../lib/rate-limit-middleware';

const auth = new Hono<{ Bindings: Env }>();

const USERNAME_AVAILABILITY_LIMIT = 30;
const USERNAME_AVAILABILITY_WINDOW_SEC = 60;
const USERNAME_AVAILABILITY_POLICY = {
  limit: USERNAME_AVAILABILITY_LIMIT,
  windowSec: USERNAME_AVAILABILITY_WINDOW_SEC,
};

auth.get('/turnstile-config', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const settings = await getSystemSettings(db);
  const turnstileEnabled = settings.turnstileEnabled && !!c.env.TURNSTILE_SECRET_KEY;
  return c.json({
    turnstileEnabled,
    strictPasswordRequirements: settings.strictPasswordRequirements,
  });
});

auth.get('/username-available', async (c) => {
  const raw = c.req.query('username') ?? '';
  const ip = resolveClientIp(c.req.raw);
  const bucketKey = buildBucketKey('username_avail', 'ip', ip);
  const blocked = await enforceRateLimit(
    c,
    bucketKey,
    USERNAME_AVAILABILITY_POLICY,
    'Too many checks. Try again shortly.',
  );
  if (blocked) return blocked;

  const db = drizzle(c.env.DB, { schema });
  const result = await isUsernameAvailable(db, raw);
  return c.json(result);
});

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

// Register — send verification email before creating account (when required)
auth.post('/register', createAuthRouteRateLimit('register'), async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db);

  const body = await c.req.json<{
    username?: string;
    email?: string;
    password?: string;
    clientLocalTime?: string;
    sessionId?: string;
    turnstileToken?: string;
  }>();
  const { username, email, password, clientLocalTime, sessionId, turnstileToken } = body;

  const turnstileError = await requireTurnstile(c, turnstileToken, {
    eventType: 'register',
    clientLocalTime,
    sessionId,
  });
  if (turnstileError) return turnstileError;

  const settings = await getSystemSettings(db);
  const usernameError = validateUsernameFormat(username ?? '');
  if (usernameError) return c.json({ error: usernameError }, 400);

  const passwordError = validatePassword(password ?? '', settings.strictPasswordRequirements);
  if (passwordError) return c.json({ error: passwordError }, 400);

  const normalizedUsername = normalizeUsername(username!);
  const normalizedEmail = normalizeEmail(email ?? '');
  const emailCheck = await checkEmailAvailableForRegistration(db, normalizedEmail);
  if (!emailCheck.ok) {
    await writeAuditLog(c, {
      eventType: 'register',
      success: false,
      failureReason: 'email_taken',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: emailCheck.error }, 400);
  }

  const usernameCheck = await isUsernameAvailable(db, normalizedUsername);
  if (!usernameCheck.available) {
    await writeAuditLog(c, {
      eventType: 'register',
      success: false,
      failureReason: 'username_taken',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: usernameCheck.reason || 'Username already taken' }, 400);
  }

  const passwordHash = await bcrypt.hash(password!, 10);
  const cf = (c.req.raw as any).cf;
  const country = (cf?.country as string) ?? null;
  const ip = clientIpFromRequest(c.req.raw);
  const ipForLog = ip ?? null;
  const registerBucketKey = buildBucketKey('auth:register', 'ip', resolveClientIp(c.req.raw));

  const failRegistration = async (
    failureReason: RegistrationFailureReason,
    failureDetail: string | null,
    auditReason: string,
    status: 502 | 500,
    message: string,
  ) => {
    await logRegistrationFailure(db, {
      username: normalizedUsername,
      email: normalizedEmail,
      failureReason,
      failureDetail,
      ipAddress: ipForLog,
      sessionId: sessionId ?? null,
    });
    await refundRateLimit(db, registerBucketKey);
    await writeAuditLog(c, {
      eventType: 'register',
      success: false,
      failureReason: auditReason,
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: message }, status);
  };

  try {
    let devVerificationCode: string | undefined;
    let inserted: typeof schema.users.$inferSelect;

    if (settings.emailVerificationRequired) {
      const otpSend = await sendRegistrationVerificationOtp(c.env, db, normalizedEmail);
      if (!otpSend.ok) {
        return failRegistration(
          registrationOtpFailureReason(c.env, otpSend.error),
          otpSend.error ?? null,
          'email_send_failed',
          502,
          'Could not send verification email. Please try again.',
        );
      }
      devVerificationCode = otpSend.devCode;

      try {
        inserted = await createRegistrationAccount(db, {
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          country,
          otp: {
            email: normalizedEmail,
            codeHash: otpSend.codeHash,
            ipAddress: ipForLog,
          },
        });
      } catch (err) {
        console.error('[register] account create failed after verification email sent', err);
        return failRegistration(
          'account_create_failed',
          err instanceof Error ? err.message : 'insert failed',
          'account_create_failed',
          500,
          'Could not create your account. Please try again.',
        );
      }
    } else {
      const verifiedAt = new Date().toISOString();
      try {
        inserted = await createRegistrationAccount(db, {
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          country,
          emailVerifiedAt: verifiedAt,
        });
      } catch (err) {
        console.error('[register] account create failed', err);
        return failRegistration(
          'account_create_failed',
          err instanceof Error ? err.message : 'insert failed',
          'account_create_failed',
          500,
          'Could not create your account. Please try again.',
        );
      }
    }

    const token = await issueAuthToken(inserted, getJwtSecret(c.env));

    await writeAuditLog(c, {
      userId: inserted.id,
      eventType: 'register',
      success: true,
      clientLocalTime,
      sessionId,
    });

    const guardOptions = { emailVerificationRequired: settings.emailVerificationRequired };

    return c.json({
      token,
      user: toSelfUser(inserted),
      registrationComplete: !getAccountBlockReason(inserted, guardOptions),
      ...(devVerificationCode ? { devVerificationCode } : {}),
    });
  } catch (err) {
    console.error('[register] unexpected error', err);
    return failRegistration(
      'account_create_failed',
      err instanceof Error ? err.message : 'unexpected error',
      'account_create_failed',
      500,
      'Could not create your account. Please try again.',
    );
  }
});

auth.post('/verify-registration', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VerifyRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  if (authUser.emailVerifiedAt) {
    return c.json({ registrationComplete: true, user: toSelfUser(authUser) });
  }

  const db = drizzle(c.env.DB, { schema });
  const email = authUser.email ? normalizeEmail(authUser.email) : null;
  if (!email) {
    return c.json({ error: 'No email on file' }, 400);
  }

  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';

  const ipLimitHour = await consumeRateLimit(db, `otp_verify:ip:${ip}:h`, OTP_VERIFY_IP_PER_HOUR, 3600);
  if (!ipLimitHour.ok) {
    return rateLimitExceeded(c, ipLimitHour);
  }

  const ipLimitDay = await consumeRateLimit(db, `otp_verify:ip:${ip}:d`, OTP_VERIFY_IP_PER_DAY, 86400);
  if (!ipLimitDay.ok) {
    return rateLimitExceeded(c, ipLimitDay);
  }

  const challenge = await db.select().from(schema.otpChallenges)
    .where(and(
      eq(schema.otpChallenges.userId, authUser.id),
      eq(schema.otpChallenges.purpose, OTP_PURPOSE_EMAIL_VERIFY),
      eq(schema.otpChallenges.email, email),
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

  const now = new Date().toISOString();
  await db.update(schema.otpChallenges)
    .set({ consumedAt: now })
    .where(eq(schema.otpChallenges.id, challenge.id))
    .run();

  const [updated] = await db.update(schema.users)
    .set({ emailVerifiedAt: now })
    .where(eq(schema.users.id, authUser.id))
    .returning();

  return c.json({
    registrationComplete: true,
    user: toSelfUser(updated),
  });
});

auth.post('/complete-username', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  if (!authUser.needsUsernameSetup) {
    return c.json({ error: 'Username is already set' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = CompleteUsernameSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  }

  const usernameError = validateUsernameFormat(parsed.data.username);
  if (usernameError) return c.json({ error: usernameError }, 400);

  const normalizedUsername = normalizeUsername(parsed.data.username);
  const db = drizzle(c.env.DB, { schema });

  const usernameCheck = await isUsernameAvailable(db, normalizedUsername, authUser.id);
  if (!usernameCheck.available) {
    return c.json({ error: usernameCheck.reason || 'Username already taken' }, 400);
  }

  const [updated] = await db.update(schema.users)
    .set({
      username: normalizedUsername,
      needsUsernameSetup: 0,
    })
    .where(eq(schema.users.id, authUser.id))
    .returning();

  const token = await issueAuthToken(updated, getJwtSecret(c.env));

  return c.json({
    token,
    user: toSelfUser(updated),
  });
});

// Login — username or email
auth.post('/login', createAuthRouteRateLimit('login'), async (c) => {
  const db = drizzle(c.env.DB, { schema });
  await seedAdminUser(db);

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
    return c.json({ error: 'Username or email and password are required' }, 400);
  }

  const identifier = username.trim();
  const isEmailLogin = identifier.includes('@');
  const normalizedIdentifier = isEmailLogin
    ? normalizeEmail(identifier)
    : normalizeUsername(identifier);

  const user = isEmailLogin
    ? await db.select().from(schema.users)
      .where(and(
        eq(schema.users.email, normalizedIdentifier),
        sql`${schema.users.deletedAt} IS NULL`,
      ))
      .get()
    : await db.select().from(schema.users)
      .where(eq(schema.users.username, normalizedIdentifier))
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

  if (!user.passwordHash) {
    await writeAuditLog(c, {
      userId: user.id,
      eventType: 'failed_login',
      success: false,
      failureReason: 'google_only_account',
      clientLocalTime,
      sessionId,
    });
    return c.json({ error: 'This account uses Google sign-in' }, 401);
  }

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

  const token = await issueAuthToken(user, getJwtSecret(c.env));

  await writeAuditLog(c, {
    userId: user.id,
    eventType: 'login',
    success: true,
    clientLocalTime,
    sessionId,
  });

  const settings = await getSystemSettings(db);

  return c.json({
    token,
    user: toSelfUser(user),
    registrationComplete: !getAccountBlockReason(user, {
      emailVerificationRequired: settings.emailVerificationRequired,
    }),
  });
});

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

auth.post('/google', createAuthRouteRateLimit('google'), async (c) => {
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

  if (!user) {
    if (googleEmail) {
      const collision = await checkGoogleEmailCollision(db, googleEmail);
      if (!collision.ok) {
        return c.json({ error: collision.error }, 409);
      }
    }

    const cf = (c.req.raw as any).cf;
    const country = (cf?.country as string) ?? null;
    const nowIso = new Date().toISOString();

    const [inserted] = await db.insert(schema.users).values({
      username: provisionalUsername(),
      passwordHash: '',
      role: 'user',
      googleId: payload.sub,
      avatarUrl: payload.picture ?? null,
      country,
      needsUsernameSetup: 1,
      ...(googleEmail
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

    if (googleEmail && !user.emailVerifiedAt) {
      const collision = await checkGoogleEmailCollision(db, googleEmail);
      if (collision.ok) {
        updates.email = googleEmail;
        updates.emailVerifiedAt = new Date().toISOString();
      }
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
    needsUsernameSetup: !!user.needsUsernameSetup,
  });
});

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

  const genericOk = () => c.json({ ok: true });
  const from = await getOutboundFromEmail(db);

  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';

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
        eq(schema.users.username, normalizeUsername(parsed.data.username.trim())),
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
    env: c.env,
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

  const settings = await getSystemSettings(db);
  const passwordError = validatePassword(parsed.data.newPassword, settings.strictPasswordRequirements);
  if (passwordError) {
    return c.json({ error: passwordError }, 400);
  }

  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';
  const verifyHour = await consumeRateLimit(
    db,
    `pwd_reset_verify:ip:${ip}:h`,
    OTP_RESET_VERIFY_IP_PER_HOUR,
    3600,
  );
  if (!verifyHour.ok) {
    return rateLimitExceeded(c, verifyHour, 'Too many attempts. Try again later.');
  }
  const verifyDay = await consumeRateLimit(
    db,
    `pwd_reset_verify:ip:${ip}:d`,
    OTP_RESET_VERIFY_IP_PER_DAY,
    86400,
  );
  if (!verifyDay.ok) {
    return rateLimitExceeded(c, verifyDay, 'Too many attempts. Try again later.');
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
        eq(schema.users.username, normalizeUsername(parsed.data.username.trim())),
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
