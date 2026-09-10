export type RateLimitPolicy = {
  limit: number;
  windowSec: number;
};

export type RateLimitSubjectKind = 'ip' | 'user';

/** Global IP baseline for all /api/* traffic. */
export const GLOBAL_API_IP: RateLimitPolicy = { limit: 300, windowSec: 300 };

export const AUTH_LOGIN_IP: RateLimitPolicy = { limit: 10, windowSec: 900 };
export const AUTH_REGISTER_IP: RateLimitPolicy = { limit: 5, windowSec: 900 };
export const AUTH_GOOGLE_IP: RateLimitPolicy = { limit: 20, windowSec: 900 };

export const WRITE_USER: RateLimitPolicy = { limit: 60, windowSec: 60 };
export const SEARCH_USER: RateLimitPolicy = { limit: 60, windowSec: 60 };

export const WS_SEND_MESSAGE: RateLimitPolicy = { limit: 60, windowSec: 60 };
export const WS_TYPING: RateLimitPolicy = { limit: 30, windowSec: 60 };

export type AuthRateLimitAction = 'login' | 'register' | 'google';

const AUTH_POLICIES: Record<AuthRateLimitAction, RateLimitPolicy> = {
  login: AUTH_LOGIN_IP,
  register: AUTH_REGISTER_IP,
  google: AUTH_GOOGLE_IP,
};

export function authRateLimitPolicy(action: AuthRateLimitAction): RateLimitPolicy {
  return AUTH_POLICIES[action];
}

export function buildBucketKey(
  action: string,
  subjectKind: RateLimitSubjectKind,
  subjectId: string | number,
): string {
  return `${action}:${subjectKind}:${subjectId}`;
}

export function isWriteMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

export function isSearchPath(pathname: string): boolean {
  return pathname === '/api/search' || pathname.startsWith('/api/search/');
}

/** Paths skipped by the global IP baseline. */
export function isGlobalRateLimitExemptPath(pathname: string, method: string): boolean {
  if (pathname === '/' || pathname === '/ws' || pathname.startsWith('/ws/')) {
    return true;
  }
  if (method === 'GET' && (pathname === '/api/media' || pathname.startsWith('/api/media/'))) {
    return true;
  }
  return false;
}

/** Mutating routes with dedicated OTP/auth rate limits — skip generic write tier. */
export function isWriteRateLimitExemptPath(pathname: string): boolean {
  if (pathname === '/api/auth/username-available' || pathname.startsWith('/api/auth/username-available/')) {
    return true;
  }
  if (pathname === '/api/auth/password-reset/request' || pathname.startsWith('/api/auth/password-reset/')) {
    return true;
  }
  if (pathname === '/api/users/me/email' || pathname.startsWith('/api/users/me/email/')) {
    return true;
  }
  return false;
}

export function resolveClientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
