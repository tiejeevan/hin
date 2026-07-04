import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import type { Env } from '../types';
import { getAuthUser } from '../lib/auth';

const media = new Hono<{ Bindings: Env }>();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TYPES = ['avatar', 'cover', 'post'] as const;
type UploadType = (typeof UPLOAD_TYPES)[number];

function folderForType(type: UploadType, userId: number): string {
  if (type === 'avatar') return `avatars/${userId}`;
  if (type === 'cover') return `covers/${userId}`;
  return `posts/${userId}`;
}

// Health check: verify R2 + D1 media_uploads stay in sync
media.get('/api/upload/health', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB, { schema });
  const key = `health/${authUser.id}/${crypto.randomUUID()}.txt`;
  const body = `health-check-${Date.now()}`;
  const origin = new URL(c.req.url).origin;
  const url = `${origin}/api/media/${key}`;

  try {
    await c.env.MEDIA.put(key, body, {
      httpMetadata: { contentType: 'text/plain' },
    });

    const object = await c.env.MEDIA.get(key);
    if (!object) {
      return c.json({ r2: 'fail', db: 'skipped', synced: false, error: 'R2 get returned null after put' }, 500);
    }
    const readBack = await object.text();
    if (readBack !== body) {
      await c.env.MEDIA.delete(key);
      return c.json({ r2: 'fail', db: 'skipped', synced: false, error: 'R2 content mismatch' }, 500);
    }

    const [row] = await db.insert(schema.mediaUploads).values({
      userId: authUser.id,
      r2Key: key,
      url,
      type: 'post',
      postId: null,
      mimeType: 'text/plain',
      sizeBytes: body.length,
    }).returning();

    const fromDb = await db
      .select()
      .from(schema.mediaUploads)
      .where(eq(schema.mediaUploads.id, row.id))
      .get();

    if (!fromDb || fromDb.r2Key !== key || fromDb.url !== url) {
      await c.env.MEDIA.delete(key);
      await db.delete(schema.mediaUploads).where(eq(schema.mediaUploads.id, row.id)).run();
      return c.json({ r2: 'ok', db: 'fail', synced: false, error: 'DB row mismatch' }, 500);
    }

    await c.env.MEDIA.delete(key);
    await db.delete(schema.mediaUploads).where(eq(schema.mediaUploads.id, row.id)).run();

    return c.json({ r2: 'ok', db: 'ok', synced: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    try {
      await c.env.MEDIA.delete(key);
    } catch (_) {}
    return c.json({ r2: 'fail', db: 'fail', synced: false, error: message }, 500);
  }
});

// Upload image to R2 and record in media_uploads
media.post('/api/upload', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | string | null;
  const uploadType = formData.get('type');

  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file provided' }, 400);
  }
  if (!UPLOAD_TYPES.includes(uploadType as UploadType)) {
    return c.json({ error: 'Invalid upload type' }, 400);
  }
  const type = uploadType as UploadType;

  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return c.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File too large (max 8MB)' }, 400);
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const folder = folderForType(type, authUser.id);
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;

  const bytes = await file.arrayBuffer();
  await c.env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  const origin = new URL(c.req.url).origin;
  const url = `${origin}/api/media/${key}`;

  const db = drizzle(c.env.DB, { schema });
  const [row] = await db.insert(schema.mediaUploads).values({
    userId: authUser.id,
    r2Key: key,
    url,
    type,
    postId: null,
    mimeType: file.type,
    sizeBytes: file.size,
  }).returning();

  return c.json({
    id: row.id,
    url: row.url,
    key: row.r2Key,
    sizeBytes: row.sizeBytes,
    type: row.type,
  });
});

// Serve uploaded media from R2
media.get('/api/media/*', async (c) => {
  const key = c.req.path.replace(/^\/api\/media\//, '');
  if (!key) return c.notFound();

  const object = await c.env.MEDIA.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

export default media;
