import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { verify } from 'hono/jwt';
import type { Context } from 'hono';
import type { Env } from '../types';

export const JWT_SECRET = 'hin-super-secret-key-12345';

// Helper to get authenticated user from JWT token
export async function getAuthUser(c: Context<{ Bindings: Env }>): Promise<any | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    const db = drizzle(c.env.DB, { schema });
    const user = await db.select().from(schema.users)
      .where(
        and(
          eq(schema.users.id, payload.id as number),
          sql`${schema.users.deletedAt} IS NULL`
        )
      )
      .get();
    return user || null;
  } catch (e) {
    return null;
  }
}
