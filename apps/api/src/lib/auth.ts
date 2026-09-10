import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { verify } from 'hono/jwt';
import type { Context } from 'hono';
import type { Env } from '../types';

/** Dev-only fallback — production must set JWT_SECRET as a Worker secret. */
export const JWT_SECRET_DEV_FALLBACK = 'hin-super-secret-key-12345';

export function getJwtSecret(env?: { JWT_SECRET?: string }): string {
  if (env?.JWT_SECRET && env.JWT_SECRET.length > 0) return env.JWT_SECRET;
  return JWT_SECRET_DEV_FALLBACK;
}

/** @deprecated Prefer getJwtSecret(env). Kept for tests that sign without env. */
export const JWT_SECRET = JWT_SECRET_DEV_FALLBACK;

export type JwtClaims = {
  id: number;
  role: string;
};

function parseBearerToken(c: Context<{ Bindings: Env }>): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/** Verify JWT and return claims without a D1 lookup (for rate-limit bypass). */
export async function getJwtClaims(c: Context<{ Bindings: Env }>): Promise<JwtClaims | null> {
  const token = parseBearerToken(c);
  if (!token) return null;

  try {
    const payload = await verify(token, getJwtSecret(c.env), 'HS256');
    const id = payload.id;
    const role = payload.role;
    if (typeof id !== 'number' || !Number.isFinite(id)) return null;
    if (typeof role !== 'string' || !role) return null;
    return { id, role };
  } catch {
    return null;
  }
}

export function isAdminJwtClaims(claims: JwtClaims | null): boolean {
  return claims?.role === 'admin';
}

// Helper to get authenticated user from JWT token
export async function getAuthUser(c: Context<{ Bindings: Env }>): Promise<any | null> {
  const token = parseBearerToken(c);
  if (!token) {
    return null;
  }
  try {
    const payload = await verify(token, getJwtSecret(c.env), 'HS256');
    const db = drizzle(c.env.DB, { schema });
    const user = await db.select().from(schema.users)
      .where(
        and(
          eq(schema.users.id, payload.id as number),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .get();

    if (user) {
      const cf = (c.req.raw as any).cf;
      const detectedCountry = (cf?.country as string) ?? null;
      if (detectedCountry && user.country !== detectedCountry) {
        await db.update(schema.users)
          .set({ country: detectedCountry })
          .where(eq(schema.users.id, user.id))
          .run();
        user.country = detectedCountry;
      }
      return user;
    }
    return null;
  } catch (e) {
    return null;
  }
}
