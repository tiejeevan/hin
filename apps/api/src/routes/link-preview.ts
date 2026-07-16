import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import { LinkPreview } from '@hin/types';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';
import { getOrFetchLinkPreview } from '../lib/linkPreview';

const linkPreviewRoute = new Hono<{ Bindings: Env }>();

// GET /api/link-preview?url=... — fetch (or reuse cached) Open Graph metadata for a URL.
// Used by the DM compose box to show a draft preview before the message is sent.
linkPreviewRoute.get('/', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Missing url' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const previewId = await getOrFetchLinkPreview(db, url, { olabidApiKey: c.env.OLABID_API_KEY });
  if (previewId === null) return c.json({ error: 'Unable to fetch preview' }, 404);

  const row = await db.select().from(schema.linkPreviews).where(eq(schema.linkPreviews.id, previewId)).get();
  if (!row) return c.json({ error: 'Unable to fetch preview' }, 404);

  const preview: LinkPreview = {
    url: row.url,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    siteName: row.siteName,
  };
  return c.json(preview);
});

export default linkPreviewRoute;
