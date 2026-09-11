import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import {
  backfillAllSharePreviews,
  backfillSharePreviewsBatch,
  buildPublicSitemapEntries,
  buildSitemapXml,
  getSharePreview,
  getSharePreviewHealth,
  parseSharePath,
  type ShareResourceType,
} from '../lib/sharePreview';

const seoRoutes = new Hono<{ Bindings: Env }>();

function requestOriginFromUrl(url: string): string {
  return new URL(url).origin;
}

function isValidResourceType(value: string): value is ShareResourceType {
  return value === 'post' || value === 'profile' || value === 'olabid' || value === 'home';
}

seoRoutes.get('/health', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const health = await getSharePreviewHealth(
    db,
    c.env,
    requestOriginFromUrl(c.req.url),
  );
  return c.json(health);
});

seoRoutes.get('/share-preview/:type/:key', async (c) => {
  const resourceType = c.req.param('type');
  const resourceKey = decodeURIComponent(c.req.param('key'));

  if (!isValidResourceType(resourceType)) {
    return c.json({ error: 'Invalid resource type' }, 400);
  }

  if (resourceType === 'olabid') {
    return c.json({ error: 'Not found' }, 404);
  }

  const db = drizzle(c.env.DB, { schema });
  const preview = await getSharePreview(
    db,
    resourceType,
    resourceKey,
    c.env,
    requestOriginFromUrl(c.req.url),
  );
  if (!preview) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(preview);
});

seoRoutes.get('/share-preview', async (c) => {
  const pathParam = c.req.query('path');
  if (!pathParam) {
    return c.json({ error: 'Missing path' }, 400);
  }

  let pathname = pathParam;
  try {
    if (pathParam.startsWith('http://') || pathParam.startsWith('https://')) {
      pathname = new URL(pathParam).pathname;
    }
  } catch {
    return c.json({ error: 'Invalid path' }, 400);
  }

  const parsed = parseSharePath(pathname);
  if (!parsed || parsed.type === 'olabid') {
    return c.json({ error: 'Not found' }, 404);
  }

  const db = drizzle(c.env.DB, { schema });
  const preview = await getSharePreview(
    db,
    parsed.type,
    parsed.key,
    c.env,
    requestOriginFromUrl(c.req.url),
  );
  if (!preview) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(preview);
});

export async function sitemapHandler(c: { env: Env; req: { url: string } }): Promise<Response> {
  const db = drizzle(c.env.DB, { schema });
  const entries = await buildPublicSitemapEntries(
    db,
    c.env,
    requestOriginFromUrl(c.req.url),
  );
  const xml = buildSitemapXml(entries);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

seoRoutes.post('/backfill', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = drizzle(c.env.DB, { schema });
  const origin = requestOriginFromUrl(c.req.url);
  const asyncMode = c.req.query('async') === '1' || c.req.query('async') === 'true';
  const cursorParam = c.req.query('cursor');
  const limitParam = c.req.query('limit');

  if (asyncMode && cursorParam === undefined && limitParam === undefined) {
    c.executionCtx.waitUntil(
      backfillAllSharePreviews(db, c.env, origin).catch(() => undefined),
    );
    return c.json({ ok: true, accepted: true, message: 'Backfill started in background' }, 202);
  }

  if (cursorParam !== undefined || limitParam !== undefined) {
    const cursor = cursorParam !== undefined ? parseInt(cursorParam, 10) : 0;
    const limit = limitParam !== undefined ? parseInt(limitParam, 10) : 100;
    if (Number.isNaN(cursor) || cursor < 0 || Number.isNaN(limit) || limit < 1 || limit > 500) {
      return c.json({ error: 'Invalid cursor or limit' }, 400);
    }

    const result = await backfillSharePreviewsBatch(db, c.env, origin, cursor, limit);
    return c.json({ ok: true, ...result });
  }

  const result = await backfillAllSharePreviews(db, c.env, origin);
  return c.json({ ok: true, ...result });
});

export default seoRoutes;
