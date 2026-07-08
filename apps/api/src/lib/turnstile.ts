import type { Context } from 'hono';
import type { Env } from '../types';
import type { AuditEventType } from '@hin/types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import { getSystemSettings } from './system-settings';
import { writeAuditLog } from './audit';

export async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteip?: string | null,
): Promise<boolean> {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: remoteip ?? undefined }),
  });
  if (!res.ok) return false;

  const data = await res.json() as { success?: boolean };
  return data.success === true;
}

/**
 * Verifies a Turnstile token for an auth route, writing an audit log on failure.
 * Returns a Response to send immediately, or null to continue the handler.
 * No-ops (returns null) when TURNSTILE_SECRET_KEY is not configured, or if the
 * setting turnstileEnabled is false, so auth keeps working without Turnstile setup.
 */
export async function requireTurnstile(
  c: Context<{ Bindings: Env }>,
  token: string | undefined,
  auditOpts: { eventType: AuditEventType; clientLocalTime?: string; sessionId?: string },
): Promise<Response | null> {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret) return null;

  const db = drizzle(c.env.DB, { schema });
  const settings = await getSystemSettings(db);
  if (!settings.turnstileEnabled) {
    return null;
  }

  if (!token) {
    return c.json({ error: 'Verification required' }, 400);
  }

  const remoteip = c.req.header('CF-Connecting-IP');
  const ok = await verifyTurnstileToken(token, secret, remoteip);
  if (!ok) {
    await writeAuditLog(c, {
      eventType: auditOpts.eventType,
      success: false,
      failureReason: 'turnstile_failed',
      clientLocalTime: auditOpts.clientLocalTime,
      sessionId: auditOpts.sessionId,
    });
    return c.json({ error: 'Verification failed' }, 403);
  }

  return null;
}
