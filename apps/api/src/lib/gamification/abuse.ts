import type { GamificationActionType } from '@hin/types';
import { calendarDayUTC } from './streaks';
import { getCounterValue, upsertCounterDelta, setCounterValue } from './counters';
import type { GamificationTx } from './counters';

/** Internal counter keys — excluded from admin/user metric displays. */
export const INTERNAL_COUNTER_PREFIX = '__';

export const DAILY_POINT_CAP = 500;
export const DAILY_SESSION_MINUTES_CAP = 120;
export const SESSION_TICK_MINUTES = 5;
/** Minimum seconds between session ticks (~4 min allows 5 min heartbeat with slack). */
export const SESSION_TICK_MIN_INTERVAL_SEC = 240;
export const COMMENT_RATE_LIMIT_PER_HOUR = 30;
export const SHARE_RATE_LIMIT_PER_HOUR = 60;

const RATE_LIMITED_ACTIONS: GamificationActionType[] = ['comment_created', 'post_shared'];

function dailyPointsKey(day: string = calendarDayUTC()): string {
  return `${INTERNAL_COUNTER_PREFIX}daily_points:${day}`;
}

function dailySessionMinutesKey(day: string = calendarDayUTC()): string {
  return `${INTERNAL_COUNTER_PREFIX}daily_session_minutes:${day}`;
}

function hourlyRateKey(action: GamificationActionType, date: Date = new Date()): string {
  const hour = date.toISOString().slice(0, 13);
  return `${INTERNAL_COUNTER_PREFIX}rate:${action}:${hour}`;
}

export function isInternalCounterKey(metricKey: string): boolean {
  return metricKey.startsWith(INTERNAL_COUNTER_PREFIX);
}

export interface AbuseCheckResult {
  blocked: boolean;
  reason?: string;
}

/** Hourly rate limits for high-frequency farming actions. */
export async function checkActionRateLimit(
  tx: GamificationTx,
  userId: number,
  action: GamificationActionType,
): Promise<AbuseCheckResult> {
  if (!RATE_LIMITED_ACTIONS.includes(action)) {
    return { blocked: false };
  }

  const limit = action === 'comment_created'
    ? COMMENT_RATE_LIMIT_PER_HOUR
    : SHARE_RATE_LIMIT_PER_HOUR;

  const key = hourlyRateKey(action);
  const count = await getCounterValue(tx, userId, key);
  if (count >= limit) {
    return { blocked: true, reason: 'rate_limit' };
  }

  await upsertCounterDelta(tx, userId, key, 1);
  return { blocked: false };
}

/** Cap total points earned per UTC calendar day. */
export async function capPointDelta(
  tx: GamificationTx,
  userId: number,
  requestedDelta: number,
): Promise<number> {
  if (requestedDelta <= 0) return requestedDelta;

  const key = dailyPointsKey();
  const dailySoFar = await getCounterValue(tx, userId, key);
  const remaining = DAILY_POINT_CAP - dailySoFar;
  if (remaining <= 0) return 0;

  const actual = Math.min(requestedDelta, remaining);
  if (actual > 0) {
    await upsertCounterDelta(tx, userId, key, actual);
  }
  return actual;
}

export interface SessionTickAllowance {
  allowed: boolean;
  minutes: number;
  reason?: string;
}

/** Duration metric guardrails for session_tick handler. */
export async function checkSessionTickAllowance(
  tx: GamificationTx,
  userId: number,
  requestedMinutes: number = SESSION_TICK_MINUTES,
): Promise<SessionTickAllowance> {
  const minutes = Math.max(1, Math.min(requestedMinutes, SESSION_TICK_MINUTES));
  const nowSec = Math.floor(Date.now() / 1000);

  const lastTick = await getCounterValue(tx, userId, `${INTERNAL_COUNTER_PREFIX}last_session_tick`);
  if (lastTick > 0 && nowSec - lastTick < SESSION_TICK_MIN_INTERVAL_SEC) {
    return { allowed: false, minutes: 0, reason: 'tick_interval' };
  }

  const dailyKey = dailySessionMinutesKey();
  const dailySoFar = await getCounterValue(tx, userId, dailyKey);
  if (dailySoFar >= DAILY_SESSION_MINUTES_CAP) {
    return { allowed: false, minutes: 0, reason: 'daily_session_cap' };
  }

  const allowedMinutes = Math.min(minutes, DAILY_SESSION_MINUTES_CAP - dailySoFar);
  if (allowedMinutes <= 0) {
    return { allowed: false, minutes: 0, reason: 'daily_session_cap' };
  }

  return { allowed: true, minutes: allowedMinutes };
}

export async function recordSessionTick(
  tx: GamificationTx,
  userId: number,
  minutes: number,
): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  await setCounterValue(tx, userId, `${INTERNAL_COUNTER_PREFIX}last_session_tick`, nowSec);
  await upsertCounterDelta(tx, userId, dailySessionMinutesKey(), minutes);
}
