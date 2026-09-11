import {
  AUTH_GOOGLE_IP,
  AUTH_LOGIN_IP,
  AUTH_REGISTER_IP,
  GLOBAL_API_IP,
  SEARCH_USER,
  WRITE_USER,
  WS_SEND_MESSAGE,
  WS_TYPING,
  type RateLimitPolicy,
} from './rate-limit-policy';
import {
  COMMENT_RATE_LIMIT_PER_HOUR,
  REPOST_RATE_LIMIT_PER_HOUR,
  SHARE_RATE_LIMIT_PER_HOUR,
} from './gamification/abuse';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESET_SEND_EMAIL_PER_DAY,
  OTP_RESET_SEND_EMAIL_PER_HOUR,
  OTP_RESET_SEND_IP_PER_DAY,
  OTP_RESET_SEND_IP_PER_HOUR,
  OTP_RESET_SEND_IP_PER_MINUTE,
  OTP_RESET_SEND_USER_PER_DAY,
  OTP_RESET_SEND_USER_PER_HOUR,
  OTP_RESET_VERIFY_IP_PER_DAY,
  OTP_RESET_VERIFY_IP_PER_HOUR,
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
} from './otp';
import type { RateLimitCatalogEntry, RateLimitCatalogResponse } from '@hin/types';

const USERNAME_AVAILABILITY = { limit: 30, windowSec: 60 };

function formatWindow(windowSec: number): string {
  if (windowSec < 60) return `${windowSec} seconds`;
  if (windowSec % 86400 === 0) {
    const days = windowSec / 86400;
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (windowSec % 3600 === 0) {
    const hours = windowSec / 3600;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (windowSec % 60 === 0) {
    const minutes = windowSec / 60;
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return `${windowSec} seconds`;
}

function formatLimit(limit: number, unit = 'requests'): string {
  return `${limit} ${unit}`;
}

function httpEntry(
  tier: string,
  scope: string,
  policy: RateLimitPolicy,
  appliesTo: string,
  notes?: string,
): RateLimitCatalogEntry {
  return {
    tier,
    scope,
    limitLabel: formatLimit(policy.limit),
    windowLabel: formatWindow(policy.windowSec),
    appliesTo,
    storage: 'd1',
    notes,
  };
}

function otpEntry(
  tier: string,
  scope: string,
  limit: number,
  windowSec: number,
  appliesTo: string,
): RateLimitCatalogEntry {
  return {
    tier,
    scope,
    limitLabel: formatLimit(limit),
    windowLabel: formatWindow(windowSec),
    appliesTo,
    storage: 'd1',
  };
}

/** Read-only catalog of active HTTP/WS/OTP rate limits for the admin dashboard. */
export function getRateLimitCatalog(): RateLimitCatalogResponse {
  const entries: RateLimitCatalogEntry[] = [
    httpEntry('Global API baseline', 'IP', GLOBAL_API_IP, 'All /api/* (except exempt paths)'),
    httpEntry('Login', 'IP', AUTH_LOGIN_IP, 'POST /api/auth/login'),
    httpEntry('Register', 'IP', AUTH_REGISTER_IP, 'POST /api/auth/register'),
    httpEntry('Google sign-in', 'IP', AUTH_GOOGLE_IP, 'POST /api/auth/google'),
    httpEntry(
      'Username availability',
      'IP',
      USERNAME_AVAILABILITY,
      'GET /api/auth/username-available',
    ),
    httpEntry('Write actions', 'User or IP', WRITE_USER, 'POST/PUT/PATCH/DELETE on /api/*'),
    httpEntry('Search', 'User', SEARCH_USER, 'GET /api/search'),
    otpEntry('Email OTP send', 'IP (minute)', OTP_SEND_IP_PER_MINUTE, OTP_RESEND_COOLDOWN_SECONDS, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP send', 'IP', OTP_SEND_IP_PER_HOUR, 3600, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP send', 'IP', OTP_SEND_IP_PER_DAY, 86400, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP send', 'User', OTP_SEND_USER_PER_HOUR, 3600, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP send', 'User', OTP_SEND_USER_PER_DAY, 86400, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP send', 'Email', OTP_SEND_EMAIL_PER_HOUR, 3600, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP send', 'Email', OTP_SEND_EMAIL_PER_DAY, 86400, 'POST /api/users/me/email/request'),
    otpEntry('Email OTP verify', 'IP', OTP_VERIFY_IP_PER_HOUR, 3600, 'POST /api/users/me/email/verify'),
    otpEntry('Email OTP verify', 'IP', OTP_VERIFY_IP_PER_DAY, 86400, 'POST /api/users/me/email/verify'),
    otpEntry('Registration OTP verify', 'IP', OTP_VERIFY_IP_PER_HOUR, 3600, 'POST /api/auth/verify-registration'),
    otpEntry('Registration OTP verify', 'IP', OTP_VERIFY_IP_PER_DAY, 86400, 'POST /api/auth/verify-registration'),
    otpEntry('Password reset send', 'IP (minute)', OTP_RESET_SEND_IP_PER_MINUTE, 60, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset send', 'IP', OTP_RESET_SEND_IP_PER_HOUR, 3600, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset send', 'IP', OTP_RESET_SEND_IP_PER_DAY, 86400, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset send', 'User', OTP_RESET_SEND_USER_PER_HOUR, 3600, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset send', 'User', OTP_RESET_SEND_USER_PER_DAY, 86400, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset send', 'Email', OTP_RESET_SEND_EMAIL_PER_HOUR, 3600, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset send', 'Email', OTP_RESET_SEND_EMAIL_PER_DAY, 86400, 'POST /api/auth/password-reset/request'),
    otpEntry('Password reset verify', 'IP', OTP_RESET_VERIFY_IP_PER_HOUR, 3600, 'POST /api/auth/password-reset/verify'),
    otpEntry('Password reset verify', 'IP', OTP_RESET_VERIFY_IP_PER_DAY, 86400, 'POST /api/auth/password-reset/verify'),
    {
      tier: 'OTP attempts',
      scope: 'Challenge',
      limitLabel: `${OTP_MAX_ATTEMPTS} attempts`,
      windowLabel: 'Per active code',
      appliesTo: 'Email verify & password reset OTP',
      storage: 'd1',
      notes: 'Code invalidated after max wrong guesses',
    },
    {
      tier: 'Chat send_message',
      scope: 'User',
      limitLabel: formatLimit(WS_SEND_MESSAGE.limit, 'messages'),
      windowLabel: formatWindow(WS_SEND_MESSAGE.windowSec),
      appliesTo: 'WebSocket send_message (requires verified/complete account at join)',
      storage: 'memory',
    },
    {
      tier: 'Chat typing',
      scope: 'User',
      limitLabel: formatLimit(WS_TYPING.limit, 'events'),
      windowLabel: formatWindow(WS_TYPING.windowSec),
      appliesTo: 'WebSocket typing (silently dropped when exceeded; requires complete account at join)',
      storage: 'memory',
    },
    {
      tier: 'Gamification comments',
      scope: 'User',
      limitLabel: formatLimit(COMMENT_RATE_LIMIT_PER_HOUR, 'comments'),
      windowLabel: '1 hour',
      appliesTo: 'comment_created (points farming guard)',
      storage: 'counter',
    },
    {
      tier: 'Gamification shares',
      scope: 'User',
      limitLabel: formatLimit(SHARE_RATE_LIMIT_PER_HOUR, 'shares'),
      windowLabel: '1 hour',
      appliesTo: 'post_shared (points farming guard)',
      storage: 'counter',
    },
    {
      tier: 'Gamification reposts',
      scope: 'User',
      limitLabel: formatLimit(REPOST_RATE_LIMIT_PER_HOUR, 'reposts'),
      windowLabel: '1 hour',
      appliesTo: 'post_reposted (points farming guard)',
      storage: 'counter',
    },
  ];

  return {
    entries,
    adminBypass: 'Admin JWT role skips HTTP and WebSocket rate limits (no DB lookup).',
    edgeNote: 'Large volumetric DDoS should be mitigated at the Cloudflare edge (WAF, leaked-credentials rule, Under Attack Mode). App limits target application-layer abuse.',
    exemptions: [
      'Global baseline skipped: /, /ws, GET /api/media/*',
      'Write tier skipped: OTP/email routes, password reset, username availability',
    ],
  };
}
