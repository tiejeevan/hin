import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import {
  RequestEmailVerificationSchema,
  VerifyEmailSchema,
  type MeEmailStatus,
} from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { toSelfUser } from '../lib/users';
import { sendOtpEmail } from '../lib/email/resend';
import { getOutboundFromEmail } from '../lib/email/outbound-from';
import { isDisposableEmail } from '../lib/email/disposable';
import { getEmailChangeStatus } from '../lib/email/change-cooldown';
import {
  OTP_MAX_ATTEMPTS,
  OTP_PURPOSE_EMAIL_VERIFY,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_SEND_EMAIL_PER_DAY,
  OTP_SEND_EMAIL_PER_HOUR,
  OTP_SEND_IP_PER_DAY,
  OTP_SEND_IP_PER_HOUR,
  OTP_SEND_IP_PER_MINUTE,
  OTP_SEND_USER_PER_DAY,
  OTP_SEND_USER_PER_HOUR,
  OTP_VERIFY_IP_PER_DAY,
  OTP_VERIFY_IP_PER_HOUR,
  codesMatch,
  generateOtpCode,
  hashOtpCode,
  isValidEmail,
  maskEmail,
  normalizeEmail,
  otpExpiresAt,
} from '../lib/otp';
import { clientIpFromRequest, consumeRateLimit } from '../lib/rate-limit';
import { rateLimitExceeded } from '../lib/rate-limit-middleware';

const emailRoutes = new Hono<{ Bindings: Env }>();

emailRoutes.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const change = getEmailChangeStatus(authUser.emailVerifiedAt);
  const payload: MeEmailStatus = {
    email: authUser.email ?? null,
    emailVerifiedAt: authUser.emailVerifiedAt ?? null,
    canChangeEmail: change.canChangeEmail,
    nextChangeAt: change.nextChangeAt,
    daysRemaining: change.daysRemaining,
  };
  return c.json(payload);
});

emailRoutes.post('/request', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const from = await getOutboundFromEmail(db);

  const body = await c.req.json().catch(() => null);
  const parsed = RequestEmailVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const email = normalizeEmail(parsed.data.email);
  if (!isValidEmail(email)) {
    return c.json({ error: 'Enter a valid email address' }, 400);
  }

  if (isDisposableEmail(email)) {
    return c.json({ error: 'Temporary email addresses are not allowed' }, 400);
  }

  // Already verified with this address — nothing to do.
  if (
    authUser.email &&
    normalizeEmail(authUser.email) === email &&
    authUser.emailVerifiedAt
  ) {
    return c.json({
      ok: true,
      alreadyVerified: true,
      maskedEmail: maskEmail(email),
    });
  }

  // Changing to a different email after first verify — enforce 15-day lock.
  const isChange =
    !!authUser.emailVerifiedAt &&
    (!authUser.email || normalizeEmail(authUser.email) !== email);
  if (isChange) {
    const change = getEmailChangeStatus(authUser.emailVerifiedAt);
    if (!change.canChangeEmail) {
      return c.json(
        {
          error: `You can change your email again in ${change.daysRemaining} day${change.daysRemaining === 1 ? '' : 's'}`,
          nextChangeAt: change.nextChangeAt,
          daysRemaining: change.daysRemaining,
        },
        403,
      );
    }
  }

  const taken = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        ne(schema.users.id, authUser.id),
        isNull(schema.users.deletedAt),
      ),
    )
    .get();

  if (taken) {
    return c.json({ error: 'This email is already in use' }, 409);
  }

  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';

  const cooldown = await consumeRateLimit(
    db,
    `otp_send_cooldown:user:${authUser.id}`,
    1,
    OTP_RESEND_COOLDOWN_SECONDS,
  );
  if (!cooldown.ok) {
    return rateLimitExceeded(c, cooldown, 'Please wait before requesting another code');
  }

  const limits = await Promise.all([
    consumeRateLimit(db, `otp_send_cooldown:ip:${ip}`, OTP_SEND_IP_PER_MINUTE, OTP_RESEND_COOLDOWN_SECONDS),
    consumeRateLimit(db, `otp_send:user:${authUser.id}:h`, OTP_SEND_USER_PER_HOUR, 3600),
    consumeRateLimit(db, `otp_send:user:${authUser.id}:d`, OTP_SEND_USER_PER_DAY, 86400),
    consumeRateLimit(db, `otp_send:ip:${ip}:h`, OTP_SEND_IP_PER_HOUR, 3600),
    consumeRateLimit(db, `otp_send:ip:${ip}:d`, OTP_SEND_IP_PER_DAY, 86400),
    consumeRateLimit(db, `otp_send:email:${email}:h`, OTP_SEND_EMAIL_PER_HOUR, 3600),
    consumeRateLimit(db, `otp_send:email:${email}:d`, OTP_SEND_EMAIL_PER_DAY, 86400),
  ]);

  for (const limit of limits) {
    if (!limit.ok) {
      return rateLimitExceeded(c, limit);
    }
  }

  // Invalidate any prior unused challenges for this user+purpose.
  await db.update(schema.otpChallenges)
    .set({ consumedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.otpChallenges.userId, authUser.id),
        eq(schema.otpChallenges.purpose, OTP_PURPOSE_EMAIL_VERIFY),
        isNull(schema.otpChallenges.consumedAt),
      ),
    )
    .run();

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code, c.env.OTP_PEPPER);
  const expiresAt = otpExpiresAt();

  await db.insert(schema.otpChallenges).values({
    purpose: OTP_PURPOSE_EMAIL_VERIFY,
    userId: authUser.id,
    email,
    codeHash,
    attempts: 0,
    expiresAt,
    ipAddress: ip === 'unknown' ? null : ip,
  });

  const sent = await sendOtpEmail({ env: c.env, from, to: email, code });
  if (!sent.ok) {
    return c.json({ error: sent.error || 'Failed to send verification email' }, 502);
  }

  return c.json({
    ok: true,
    maskedEmail: maskEmail(email),
    expiresInSeconds: 600,
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  });
});

emailRoutes.post('/verify', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = VerifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid request' }, 400);
  }

  const email = normalizeEmail(parsed.data.email);
  const code = parsed.data.code;

  if (isDisposableEmail(email)) {
    return c.json({ error: 'Temporary email addresses are not allowed' }, 400);
  }

  const isChange =
    !!authUser.emailVerifiedAt &&
    (!authUser.email || normalizeEmail(authUser.email) !== email);
  if (isChange) {
    const change = getEmailChangeStatus(authUser.emailVerifiedAt);
    if (!change.canChangeEmail) {
      return c.json(
        {
          error: `You can change your email again in ${change.daysRemaining} day${change.daysRemaining === 1 ? '' : 's'}`,
          nextChangeAt: change.nextChangeAt,
          daysRemaining: change.daysRemaining,
        },
        403,
      );
    }
  }

  const db = drizzle(c.env.DB, { schema });
  const ip = clientIpFromRequest(c.req.raw) ?? 'unknown';

  const ipLimitHour = await consumeRateLimit(db, `otp_verify:ip:${ip}:h`, OTP_VERIFY_IP_PER_HOUR, 3600);
  if (!ipLimitHour.ok) {
    return rateLimitExceeded(c, ipLimitHour);
  }

  const ipLimitDay = await consumeRateLimit(db, `otp_verify:ip:${ip}:d`, OTP_VERIFY_IP_PER_DAY, 86400);
  if (!ipLimitDay.ok) {
    return rateLimitExceeded(c, ipLimitDay);
  }

  const nowIso = new Date().toISOString();

  const challenge = await db.select()
    .from(schema.otpChallenges)
    .where(
      and(
        eq(schema.otpChallenges.userId, authUser.id),
        eq(schema.otpChallenges.purpose, OTP_PURPOSE_EMAIL_VERIFY),
        eq(schema.otpChallenges.email, email),
        isNull(schema.otpChallenges.consumedAt),
        sql`${schema.otpChallenges.expiresAt} > ${nowIso}`,
      ),
    )
    .orderBy(desc(schema.otpChallenges.createdAt))
    .get();

  if (!challenge) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await db.update(schema.otpChallenges)
      .set({ consumedAt: nowIso })
      .where(eq(schema.otpChallenges.id, challenge.id))
      .run();
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const match = await codesMatch(code, challenge.codeHash, c.env.OTP_PEPPER);
  if (!match) {
    const nextAttempts = challenge.attempts + 1;
    await db.update(schema.otpChallenges)
      .set({
        attempts: nextAttempts,
        ...(nextAttempts >= OTP_MAX_ATTEMPTS ? { consumedAt: nowIso } : {}),
      })
      .where(eq(schema.otpChallenges.id, challenge.id))
      .run();
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  const taken = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        ne(schema.users.id, authUser.id),
        isNull(schema.users.deletedAt),
      ),
    )
    .get();

  if (taken) {
    await db.update(schema.otpChallenges)
      .set({ consumedAt: nowIso })
      .where(eq(schema.otpChallenges.id, challenge.id))
      .run();
    return c.json({ error: 'This email is already in use' }, 409);
  }

  await db.update(schema.otpChallenges)
    .set({ consumedAt: nowIso })
    .where(eq(schema.otpChallenges.id, challenge.id))
    .run();

  const [updated] = await db.update(schema.users)
    .set({
      email,
      emailVerifiedAt: nowIso,
    })
    .where(eq(schema.users.id, authUser.id))
    .returning();

  return c.json({
    ok: true,
    user: toSelfUser(updated),
  });
});

export default emailRoutes;
