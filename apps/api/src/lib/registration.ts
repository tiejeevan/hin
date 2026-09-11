import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import {
  OTP_PURPOSE_EMAIL_VERIFY,
  otpExpiresAt,
} from './otp';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type RegistrationFailureReason =
  | 'smtp_error'
  | 'email_not_configured'
  | 'account_create_failed'
  | 'otp_persist_failed';

export interface LogRegistrationFailureParams {
  username: string;
  email: string | null;
  failureReason: RegistrationFailureReason;
  failureDetail?: string | null;
  ipAddress?: string | null;
  sessionId?: string | null;
}

export async function logRegistrationFailure(
  db: Db,
  params: LogRegistrationFailureParams,
): Promise<void> {
  await db.insert(schema.registrationFailures).values({
    username: params.username,
    email: params.email,
    failureReason: params.failureReason,
    failureDetail: params.failureDetail ?? null,
    ipAddress: params.ipAddress ?? null,
    sessionId: params.sessionId ?? null,
  }).run();
}

export interface CreateRegistrationAccountParams {
  username: string;
  email: string;
  passwordHash: string;
  country: string | null;
  emailVerifiedAt?: string;
  otp?: {
    email: string;
    codeHash: string;
    ipAddress: string | null;
  };
}

export type CreatedRegistrationUser = typeof schema.users.$inferSelect;

/** Insert user + settings (+ optional OTP). Compensating delete on any failure. */
export async function createRegistrationAccount(
  db: Db,
  params: CreateRegistrationAccountParams,
): Promise<CreatedRegistrationUser> {
  let userId: number | null = null;
  try {
    const [inserted] = await db.insert(schema.users).values({
      username: params.username,
      email: params.email,
      passwordHash: params.passwordHash,
      role: 'user',
      country: params.country,
      needsUsernameSetup: 0,
      ...(params.emailVerifiedAt ? { emailVerifiedAt: params.emailVerifiedAt } : {}),
    }).returning();

    userId = inserted.id;

    await db.insert(schema.userSettings).values({ userId: inserted.id }).run();

    if (params.otp) {
      await db.insert(schema.otpChallenges).values({
        purpose: OTP_PURPOSE_EMAIL_VERIFY,
        userId: inserted.id,
        email: params.otp.email,
        codeHash: params.otp.codeHash,
        attempts: 0,
        expiresAt: otpExpiresAt(),
        ipAddress: params.otp.ipAddress,
      }).run();
    }

    return inserted;
  } catch (err) {
    if (userId != null) {
      await db.delete(schema.users).where(eq(schema.users.id, userId)).run();
    }
    throw err;
  }
}

export function deletedUsernameTombstone(userId: number): string {
  return `__del_${userId}`;
}
