import type { Context, MiddlewareHandler } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getJwtClaims, isAdminJwtClaims } from './auth';
import {
  authRateLimitPolicy,
  buildBucketKey,
  GLOBAL_API_IP,
  GLOBAL_API_USER,
  isGlobalRateLimitExemptPath,
  isSearchPath,
  isWriteMethod,
  isWriteRateLimitExemptPath,
  resolveClientIp,
  SEARCH_USER,
  WRITE_USER,
  type AuthRateLimitAction,
  type RateLimitPolicy,
} from './rate-limit-policy';
import { consumeRateLimit, type RateLimitResult } from './rate-limit';

type ApiContext = Context<{ Bindings: Env }>;

export const RATE_LIMIT_USER_MESSAGE =
  'Too many requests. Please wait a moment and try again.';

export function rateLimitExceeded(
  c: ApiContext,
  result: Extract<RateLimitResult, { ok: false }>,
  errorMessage = RATE_LIMIT_USER_MESSAGE,
): Response {
  c.header('Retry-After', String(result.retryAfterSeconds));
  return c.json(
    {
      error: errorMessage,
      code: 'rate_limit',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    429,
  );
}

export async function enforceRateLimit(
  c: ApiContext,
  bucketKey: string,
  policy: RateLimitPolicy,
  errorMessage?: string,
): Promise<Response | null> {
  const db = drizzle(c.env.DB, { schema });
  const result = await consumeRateLimit(db, bucketKey, policy.limit, policy.windowSec);
  if (!result.ok) {
    return rateLimitExceeded(c, result, errorMessage);
  }
  return null;
}

async function shouldBypassRateLimit(c: ApiContext): Promise<boolean> {
  const claims = await getJwtClaims(c);
  return isAdminJwtClaims(claims);
}

function pathnameFromContext(c: ApiContext): string {
  return new URL(c.req.url).pathname;
}

export function createGlobalRateLimitMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const pathname = pathnameFromContext(c);
    if (isGlobalRateLimitExemptPath(pathname, c.req.method)) {
      return next();
    }
    if (await shouldBypassRateLimit(c)) {
      return next();
    }

    const claims = await getJwtClaims(c);
    const ip = resolveClientIp(c.req.raw);
    const bucketKey = claims
      ? buildBucketKey('api:global', 'user', claims.id)
      : buildBucketKey('api:global', 'ip', ip);
    const policy = claims ? GLOBAL_API_USER : GLOBAL_API_IP;
    const blocked = await enforceRateLimit(c, bucketKey, policy);
    if (blocked) return blocked;

    return next();
  };
}

export function createWriteRateLimitMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (!isWriteMethod(c.req.method)) {
      return next();
    }

    const pathname = pathnameFromContext(c);
    if (isWriteRateLimitExemptPath(pathname)) {
      return next();
    }
    if (await shouldBypassRateLimit(c)) {
      return next();
    }

    const claims = await getJwtClaims(c);
    const bucketKey = claims
      ? buildBucketKey('api:write', 'user', claims.id)
      : buildBucketKey('api:write', 'ip', resolveClientIp(c.req.raw));

    const blocked = await enforceRateLimit(c, bucketKey, WRITE_USER);
    if (blocked) return blocked;

    return next();
  };
}

export function createSearchRateLimitMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const pathname = pathnameFromContext(c);
    if (!isSearchPath(pathname)) {
      return next();
    }
    if (await shouldBypassRateLimit(c)) {
      return next();
    }

    const claims = await getJwtClaims(c);
    if (!claims) {
      return next();
    }

    const bucketKey = buildBucketKey('api:search', 'user', claims.id);
    const blocked = await enforceRateLimit(c, bucketKey, SEARCH_USER);
    if (blocked) return blocked;

    return next();
  };
}

export function createAuthRouteRateLimit(action: AuthRateLimitAction): MiddlewareHandler<{ Bindings: Env }> {
  const policy = authRateLimitPolicy(action);
  return async (c, next) => {
    if (await shouldBypassRateLimit(c)) {
      return next();
    }

    const ip = resolveClientIp(c.req.raw);
    const bucketKey = buildBucketKey(`auth:${action}`, 'ip', ip);
    const blocked = await enforceRateLimit(c, bucketKey, policy);
    if (blocked) return blocked;

    return next();
  };
}
