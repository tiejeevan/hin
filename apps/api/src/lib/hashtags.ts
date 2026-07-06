import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as schema from '@hin/db';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const HASHTAG_RE = /#([a-zA-Z0-9_]{1,50})\b/g;

/** Unique hashtags in text (normalized to lowercase, deduped, '#' stripped). */
export function parseHashtags(content: string): string[] {
  const matches = content.matchAll(HASHTAG_RE);
  const seen = new Set<string>();
  for (const match of matches) {
    seen.add(match[1].toLowerCase());
  }
  return Array.from(seen);
}

/**
 * Sync a post's hashtag associations to match its current content.
 * Safe to call on both create and edit — replaces all `post_hashtags` rows for the post.
 */
export async function syncPostHashtags(db: Db, postId: number, content: string): Promise<void> {
  const tags = parseHashtags(content);

  // Always clear first so edits that remove a hashtag are reflected.
  await db.delete(schema.postHashtags).where(eq(schema.postHashtags.postId, postId)).run();
  if (tags.length === 0) return;

  const existing = await db
    .select({ id: schema.hashtags.id, tag: schema.hashtags.tag })
    .from(schema.hashtags)
    .where(inArray(schema.hashtags.tag, tags))
    .all();

  const existingTagIds = new Map(existing.map(h => [h.tag, h.id]));
  const newTags = tags.filter(t => !existingTagIds.has(t));

  for (const tag of newTags) {
    // Insert-or-ignore: two concurrent posts could race to create the same new tag.
    await db.insert(schema.hashtags).values({ tag }).onConflictDoNothing().run();
  }

  const allHashtags = newTags.length > 0
    ? await db
        .select({ id: schema.hashtags.id, tag: schema.hashtags.tag })
        .from(schema.hashtags)
        .where(inArray(schema.hashtags.tag, tags))
        .all()
    : existing;

  const hashtagIds = allHashtags.map(h => h.id);
  if (hashtagIds.length === 0) return;

  await db.insert(schema.postHashtags).values(
    hashtagIds.map(hashtagId => ({ postId, hashtagId })),
  ).onConflictDoNothing().run();
}

export interface TrendingHashtagRow {
  tag: string;
  count: number;
}

/** Trending hashtags computed from a live aggregate over public, non-deleted posts within the window. */
export async function getTrendingHashtags(
  db: Db,
  opts: { windowHours: number; limit: number },
): Promise<TrendingHashtagRow[]> {
  const since = new Date(Date.now() - opts.windowHours * 60 * 60 * 1000).toISOString();

  const rows = await db
    .select({
      tag: schema.hashtags.tag,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.postHashtags)
    .innerJoin(schema.hashtags, eq(schema.postHashtags.hashtagId, schema.hashtags.id))
    .innerJoin(schema.posts, eq(schema.postHashtags.postId, schema.posts.id))
    .where(and(
      sql`${schema.posts.deletedAt} IS NULL`,
      eq(schema.posts.visibility, 'public'),
      sql`${schema.posts.createdAt} >= ${since}`,
    ))
    .groupBy(schema.hashtags.tag)
    .orderBy(sql`count(*) DESC`)
    .limit(opts.limit)
    .all();

  return rows.map(r => ({ tag: r.tag, count: Number(r.count) }));
}
