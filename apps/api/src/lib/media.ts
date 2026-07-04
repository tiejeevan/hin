import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hin/db';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export function parseMediaUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === 'string');
    }
  } catch {
    // Legacy single URL stored as plain text
    if (raw.startsWith('http') || raw.startsWith('/')) return [raw];
  }
  return [];
}

export function serializeMediaUrls(urls: string[]): string | null {
  if (!urls.length) return null;
  return JSON.stringify(urls.slice(0, 5));
}

export async function linkPostMedia(
  db: Db,
  userId: number,
  postId: number,
  mediaUrls: string[],
) {
  for (const url of mediaUrls) {
    await db
      .update(schema.mediaUploads)
      .set({ postId })
      .where(
        and(
          eq(schema.mediaUploads.url, url),
          eq(schema.mediaUploads.userId, userId),
          eq(schema.mediaUploads.type, 'post'),
          isNull(schema.mediaUploads.postId),
        ),
      )
      .run();
  }
}

export async function validateOwnedPostMedia(
  db: Db,
  userId: number,
  mediaUrls: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mediaUrls.length > 5) {
    return { ok: false, error: 'Maximum 5 images allowed' };
  }
  for (const url of mediaUrls) {
    const row = await db
      .select()
      .from(schema.mediaUploads)
      .where(
        and(
          eq(schema.mediaUploads.url, url),
          eq(schema.mediaUploads.userId, userId),
          eq(schema.mediaUploads.type, 'post'),
          isNull(schema.mediaUploads.postId),
        ),
      )
      .get();
    if (!row) {
      return { ok: false, error: 'Invalid or unauthorized media URL' };
    }
  }
  return { ok: true };
}
