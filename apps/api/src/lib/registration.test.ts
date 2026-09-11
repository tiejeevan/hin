import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as schema from '@hin/db';
import { drizzle } from 'drizzle-orm/d1';
import {
  registrationOtpFailureReason,
  sendRegistrationVerificationOtp,
  sendVerificationOtpEmail,
} from './email/verification-otp';
import { createRegistrationAccount, deletedUsernameTombstone, logRegistrationFailure } from './registration';
import type { Env } from '../types';

vi.mock('./email/resend', () => ({
  sendOtpEmail: vi.fn(),
}));

vi.mock('./email/smtp', () => ({
  isSmtpConfigured: vi.fn(() => true),
}));

vi.mock('./email/outbound-from', () => ({
  getOutboundFromEmail: vi.fn(async () => 'noreply@hingot.com'),
}));

vi.mock('../auth', () => ({
  getJwtSecret: vi.fn(() => 'dev-secret'),
  JWT_SECRET_DEV_FALLBACK: 'dev-secret',
}));

import { sendOtpEmail } from './email/resend';
import { isSmtpConfigured } from './email/smtp';

const mockSendOtpEmail = vi.mocked(sendOtpEmail);
const mockIsSmtpConfigured = vi.mocked(isSmtpConfigured);

function createMockDb() {
  const inserts: unknown[] = [];
  const deletes: unknown[] = [];
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((row: unknown) => ({
        returning: vi.fn(async () => {
          inserts.push(row);
          return [{ id: 42, ...(row as object) }];
        }),
        run: vi.fn(async () => {
          inserts.push(row);
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        run: vi.fn(async () => {
          deletes.push(true);
        }),
      })),
    })),
    _inserts: inserts,
    _deletes: deletes,
  };
  return db as unknown as ReturnType<typeof drizzle<typeof schema>>;
}

describe('registrationOtpFailureReason', () => {
  it('maps missing SMTP config', () => {
    mockIsSmtpConfigured.mockReturnValue(false);
    expect(registrationOtpFailureReason({} as Env)).toBe('email_not_configured');
    expect(registrationOtpFailureReason({} as Env, 'Email is not configured')).toBe('email_not_configured');
  });

  it('maps SMTP transport errors', () => {
    mockIsSmtpConfigured.mockReturnValue(true);
    expect(registrationOtpFailureReason({} as Env, 'Failed to send email')).toBe('smtp_error');
  });
});

describe('deletedUsernameTombstone', () => {
  it('uses internal tombstone prefix', () => {
    expect(deletedUsernameTombstone(15)).toBe('__del_15');
  });
});

describe('sendRegistrationVerificationOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSmtpConfigured.mockReturnValue(true);
  });

  it('does not require a user row when SMTP fails', async () => {
    mockSendOtpEmail.mockResolvedValue({ ok: false, error: 'Failed to send email' });
    const db = createMockDb();
    const result = await sendRegistrationVerificationOtp({ OTP_PEPPER: 'pepper' } as Env, db, 'user@example.com');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed/i);
    expect(db._inserts).toHaveLength(0);
  });

  it('returns code hash when SMTP succeeds', async () => {
    mockSendOtpEmail.mockResolvedValue({ ok: true });
    const db = createMockDb();
    const result = await sendRegistrationVerificationOtp({ OTP_PEPPER: 'pepper' } as Env, db, 'user@example.com');
    expect(result.ok).toBe(true);
    expect(result.codeHash).toBeTruthy();
    expect(result.code).toMatch(/^\d{4}$/);
  });
});

describe('createRegistrationAccount', () => {
  it('compensates with user delete when OTP insert fails', async () => {
    let runCount = 0;
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn((row: unknown) => ({
          returning: vi.fn(async () => [{ id: 99, ...(row as object) }]),
          run: vi.fn(async () => {
            runCount += 1;
            if (runCount === 1) return;
            throw new Error('otp insert failed');
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ run: vi.fn(async () => {}) })),
      })),
    } as unknown as ReturnType<typeof drizzle<typeof schema>>;

    await expect(createRegistrationAccount(db, {
      username: 'newuser',
      email: 'new@example.com',
      passwordHash: 'hash',
      country: 'US',
      otp: {
        email: 'new@example.com',
        codeHash: 'hash123',
        ipAddress: null,
      },
    })).rejects.toThrow('otp insert failed');

    expect(db.delete).toHaveBeenCalled();
  });
});

describe('logRegistrationFailure', () => {
  it('inserts a failures row without secrets', async () => {
    const db = createMockDb();
    await logRegistrationFailure(db, {
      username: 'taken',
      email: 'user@example.com',
      failureReason: 'smtp_error',
      failureDetail: 'Failed to send email',
    });
    expect(db._inserts).toHaveLength(1);
    expect(db._inserts[0]).toMatchObject({
      username: 'taken',
      email: 'user@example.com',
      failureReason: 'smtp_error',
    });
  });
});

describe('sendVerificationOtpEmail dev path', () => {
  beforeEach(() => {
    mockIsSmtpConfigured.mockReturnValue(false);
    mockSendOtpEmail.mockClear();
  });

  it('returns dev code when SMTP is not configured', async () => {
    const db = createMockDb();
    const result = await sendVerificationOtpEmail({} as Env, db, 'dev@example.com', '1234');
    expect(result.ok).toBe(true);
    expect(result.devCode).toBe('1234');
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });
});
