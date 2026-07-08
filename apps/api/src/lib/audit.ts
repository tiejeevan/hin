/**
 * lib/audit.ts — Reusable audit log writer.
 *
 * Reads Cloudflare geo/IP data from the request and writes a row to audit_logs.
 * Never throws — wrapped in try/catch so logging failures never break auth flows.
 */
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql as rawSql, isNull } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Context } from 'hono';
import type { Env } from '../types';
import type { AuditEventType, AuditDeviceType } from '@hin/types';

export type { AuditEventType };


// ---------------------------------------------------------------------------
// User-Agent parser (lightweight — no dependencies)
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): {
  deviceType: AuditDeviceType;
  os: string | null;
  browser: string | null;
} {
  if (!ua) return { deviceType: 'unknown', os: null, browser: null };

  const lower = ua.toLowerCase();

  // Device type
  let deviceType: AuditDeviceType = 'desktop';
  if (/bot|crawler|spider|slurp|bingbot|googlebot|facebookexternalhit/i.test(ua)) {
    deviceType = 'bot';
  } else if (/tablet|ipad/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/mobile|android(?!.*tablet)|iphone|ipod|windows phone|blackberry|bb10/i.test(ua)) {
    deviceType = 'mobile';
  }

  // OS detection
  let os: string | null = null;
  if (/iphone os ([\d_]+)/i.test(ua)) {
    os = `iOS ${ua.match(/iphone os ([\d_]+)/i)![1].replace(/_/g, '.')}`;
  } else if (/ipad; cpu os ([\d_]+)/i.test(ua)) {
    os = `iPadOS ${ua.match(/ipad; cpu os ([\d_]+)/i)![1].replace(/_/g, '.')}`;
  } else if (/android ([\d.]+)/i.test(ua)) {
    os = `Android ${ua.match(/android ([\d.]+)/i)![1]}`;
  } else if (/windows nt ([\d.]+)/i.test(ua)) {
    const ntMap: Record<string, string> = {
      '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP',
    };
    const nt = ua.match(/windows nt ([\d.]+)/i)![1];
    os = `Windows ${ntMap[nt] ?? nt}`;
  } else if (/mac os x ([\d_]+)/i.test(ua)) {
    os = `macOS ${ua.match(/mac os x ([\d_]+)/i)![1].replace(/_/g, '.')}`;
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  // Browser detection (order matters — Chrome must come after Edge/OPR)
  let browser: string | null = null;
  if (/edg\/([\d.]+)/i.test(ua)) {
    browser = `Edge ${ua.match(/edg\/([\d.]+)/i)![1].split('.')[0]}`;
  } else if (/opr\/([\d.]+)/i.test(ua) || /opera\/([\d.]+)/i.test(ua)) {
    const v = ua.match(/(?:opr|opera)\/([\d.]+)/i)![1];
    browser = `Opera ${v.split('.')[0]}`;
  } else if (/chrome\/([\d.]+)/i.test(ua) && !/chromium/i.test(ua)) {
    browser = `Chrome ${ua.match(/chrome\/([\d.]+)/i)![1].split('.')[0]}`;
  } else if (/firefox\/([\d.]+)/i.test(ua)) {
    browser = `Firefox ${ua.match(/firefox\/([\d.]+)/i)![1].split('.')[0]}`;
  } else if (/version\/([\d.]+).*safari/i.test(ua)) {
    browser = `Safari ${ua.match(/version\/([\d.]+)/i)![1].split('.')[0]}`;
  } else if (/safari/i.test(ua)) {
    browser = 'Safari';
  } else if (/msie ([\d.]+)/i.test(ua) || /trident\//i.test(ua)) {
    const v = ua.match(/(?:msie |rv:)([\d.]+)/i)?.[1] ?? '11';
    browser = `IE ${v.split('.')[0]}`;
  }

  return { deviceType, os, browser };
}

// ---------------------------------------------------------------------------
// Geo extractor (Cloudflare request.cf object)
// ---------------------------------------------------------------------------

function extractGeo(request: Request) {
  // In Cloudflare Workers, request.cf is an IncomingRequestCfProperties object.
  // It is typed as `unknown` in some versions — cast safely.
  const cf = (request as any).cf as Record<string, unknown> | undefined;
  return {
    country: (cf?.country as string) ?? null,
    region: (cf?.region as string) ?? null,
    city: (cf?.city as string) ?? null,
    postalCode: (cf?.postalCode as string) ?? null,
    latitude: cf?.latitude != null ? String(cf.latitude) : null,
    longitude: cf?.longitude != null ? String(cf.longitude) : null,
    timezone: (cf?.timezone as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main write function
// ---------------------------------------------------------------------------

export interface WriteAuditLogOptions {
  userId?: number | null;
  eventType: AuditEventType;
  success: boolean;
  failureReason?: string | null;
  targetUserId?: number | null;
  sessionId?: string | null;
  clientLocalTime?: string | null;
}

export async function writeAuditLog(
  c: Context<{ Bindings: Env }>,
  opts: WriteAuditLogOptions,
): Promise<void> {
  try {
    const db = drizzle(c.env.DB, { schema });
    const req = c.req.raw;

    // IP — Cloudflare always sets CF-Connecting-IP for Workers
    const ipAddress =
      req.headers.get('CF-Connecting-IP') ??
      req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
      null;

    const geo = extractGeo(req);
    const userAgent = req.headers.get('User-Agent');
    const { deviceType, os, browser } = parseUserAgent(userAgent);

    await db.insert(schema.auditLogs).values({
      userId: opts.userId ?? null,
      eventType: opts.eventType,
      success: opts.success ? 1 : 0,
      failureReason: opts.failureReason ?? null,
      ipAddress,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      postalCode: geo.postalCode,
      latitude: geo.latitude,
      longitude: geo.longitude,
      timezone: geo.timezone,
      userAgent,
      deviceType,
      os,
      browser,
      clientLocalTime: opts.clientLocalTime ?? null,
      sessionId: opts.sessionId ?? null,
      targetUserId: opts.targetUserId ?? null,
    });
  } catch (err) {
    // Never propagate — audit failure must never break auth flows
    console.error('[audit] Failed to write audit log:', err);
  }
}

/**
 * Soft-delete all audit logs for a given user.
 * Called when the user deletes their account.
 * Rows will be hard-purged 90 days later.
 */
export async function softDeleteUserAuditLogs(
  c: Context<{ Bindings: Env }>,
  userId: number,
): Promise<void> {
  try {
    const db = drizzle(c.env.DB, { schema });
    const now = new Date().toISOString();
    await db
      .update(schema.auditLogs)
      .set({ deletedAt: now })
      .where(
        rawSql`${schema.auditLogs.userId} = ${userId} AND ${schema.auditLogs.deletedAt} IS NULL`,
      )
      .run();
  } catch (err) {
    console.error('[audit] Failed to soft-delete audit logs:', err);
  }
}

