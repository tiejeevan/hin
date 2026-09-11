import { drizzle } from 'drizzle-orm/d1';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '@hin/db';
import { parseMediaUrls } from './media';
import { resolveSiteUrls, type SiteUrlEnv } from './siteUrl';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export const SITE_NAME = 'Hin';
export const DEFAULT_BRAND_IMAGE_PATH = '/icons/icon-512.png';

export type ShareResourceType = 'post' | 'profile' | 'olabid' | 'home';

export interface SharePreviewDto {
  title: string;
  description: string;
  imageUrl: string;
  siteName: string;
  canonicalUrl: string;
  robots: string;
  isPublic: boolean;
  resourceType: ShareResourceType;
  resourceKey: string;
}

export interface SharePreviewUrls {
  siteUrl: string;
  apiOrigin: string;
}

export function getSharePreviewUrls(env: SiteUrlEnv, requestOrigin?: string): SharePreviewUrls {
  return resolveSiteUrls(env, requestOrigin);
}

export function truncateForOg(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

export function resolveShareImageUrl(
  url: string | null | undefined,
  urls: SharePreviewUrls,
): string {
  if (!url) {
    return `${urls.siteUrl}${DEFAULT_BRAND_IMAGE_PATH}`;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  if (url.startsWith('/api/media/')) {
    return `${urls.apiOrigin}${url}`;
  }
  if (url.startsWith('/')) {
    return `${urls.siteUrl}${url}`;
  }
  return `${urls.siteUrl}/${url}`;
}

export function buildHomeSharePreview(urls: SharePreviewUrls): SharePreviewDto {
  const canonicalUrl = `${urls.siteUrl}/`;
  return {
    title: 'Hin — Social Media Platform',
    description: 'Social media and real-time messaging.',
    imageUrl: resolveShareImageUrl(DEFAULT_BRAND_IMAGE_PATH, urls),
    siteName: SITE_NAME,
    canonicalUrl,
    robots: 'index,follow',
    isPublic: true,
    resourceType: 'home',
    resourceKey: 'home',
  };
}

export function buildPrivateSharePreview(
  urls: SharePreviewUrls,
  resourceType: ShareResourceType,
  resourceKey: string,
  canonicalPath: string,
  message: string,
): SharePreviewDto {
  return {
    title: SITE_NAME,
    description: message,
    imageUrl: resolveShareImageUrl(DEFAULT_BRAND_IMAGE_PATH, urls),
    siteName: SITE_NAME,
    canonicalUrl: `${urls.siteUrl}${canonicalPath}`,
    robots: 'noindex,nofollow',
    isPublic: false,
    resourceType,
    resourceKey,
  };
}

export function buildPostSharePreviewFields(input: {
  postId: number;
  username: string;
  content: string;
  type: string;
  pollQuestion?: string | null;
  mediaUrls: string | null;
  linkPreviewImageUrl?: string | null;
  authorAvatarUrl?: string | null;
  visibility: string;
  authorIsPrivate: boolean;
  deleted: boolean;
  urls: SharePreviewUrls;
}): SharePreviewDto {
  const canonicalPath = `/post/${input.postId}`;
  const isPublic = !input.deleted
    && input.visibility === 'public'
    && !input.authorIsPrivate;

  if (!isPublic) {
    const message = input.authorIsPrivate
      ? 'This post is from a protected account on Hin.'
      : 'This post is private on Hin.';
    return buildPrivateSharePreview(
      input.urls,
      'post',
      String(input.postId),
      canonicalPath,
      message,
    );
  }

  const media = parseMediaUrls(input.mediaUrls);
  const title = input.type === 'poll' && input.pollQuestion
    ? truncateForOg(input.pollQuestion, 80)
    : `@${input.username} on Hin`;

  const description = input.type === 'poll' && input.pollQuestion
    ? truncateForOg(input.pollQuestion, 200)
    : truncateForOg(input.content || 'View this post on Hin.', 200);

  const imageUrl = resolveShareImageUrl(
    media[0] ?? input.linkPreviewImageUrl ?? input.authorAvatarUrl,
    input.urls,
  );

  return {
    title,
    description,
    imageUrl,
    siteName: SITE_NAME,
    canonicalUrl: `${input.urls.siteUrl}${canonicalPath}`,
    robots: 'index,follow',
    isPublic: true,
    resourceType: 'post',
    resourceKey: String(input.postId),
  };
}

export function buildProfileSharePreviewFields(input: {
  username: string;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  isPrivate: boolean;
  deleted: boolean;
  urls: SharePreviewUrls;
}): SharePreviewDto {
  const canonicalPath = `/profile/${encodeURIComponent(input.username)}`;
  const isPublic = !input.deleted && !input.isPrivate;

  if (!isPublic) {
    return buildPrivateSharePreview(
      input.urls,
      'profile',
      input.username,
      canonicalPath,
      'This profile is private on Hin.',
    );
  }

  const description = input.bio?.trim()
    ? truncateForOg(input.bio, 200)
    : `View @${input.username}'s profile on Hin.`;

  return {
    title: `@${input.username} on Hin`,
    description,
    imageUrl: resolveShareImageUrl(input.avatarUrl ?? input.coverUrl, input.urls),
    siteName: SITE_NAME,
    canonicalUrl: `${input.urls.siteUrl}${canonicalPath}`,
    robots: 'index,follow',
    isPublic: true,
    resourceType: 'profile',
    resourceKey: input.username,
  };
}

async function upsertSharePreviewRow(db: Db, dto: SharePreviewDto): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(schema.sharePreviews).values({
    resourceType: dto.resourceType,
    resourceKey: dto.resourceKey,
    canonicalUrl: dto.canonicalUrl,
    title: dto.title,
    description: dto.description,
    imageUrl: dto.imageUrl,
    siteName: dto.siteName,
    robots: dto.robots,
    isPublic: dto.isPublic ? 1 : 0,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [schema.sharePreviews.resourceType, schema.sharePreviews.resourceKey],
    set: {
      canonicalUrl: dto.canonicalUrl,
      title: dto.title,
      description: dto.description,
      imageUrl: dto.imageUrl,
      siteName: dto.siteName,
      robots: dto.robots,
      isPublic: dto.isPublic ? 1 : 0,
      updatedAt: now,
    },
  }).run();
}

export async function deleteSharePreview(
  db: Db,
  resourceType: ShareResourceType,
  resourceKey: string,
): Promise<void> {
  await db.delete(schema.sharePreviews).where(
    and(
      eq(schema.sharePreviews.resourceType, resourceType),
      eq(schema.sharePreviews.resourceKey, resourceKey),
    ),
  ).run();
}

export async function ensureHomeSharePreview(
  db: Db,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<SharePreviewDto> {
  const urls = getSharePreviewUrls(env, requestOrigin);
  const dto = buildHomeSharePreview(urls);
  await upsertSharePreviewRow(db, dto);
  return dto;
}

export async function refreshPostSharePreview(
  db: Db,
  postId: number,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<SharePreviewDto | null> {
  const row = await db.select({
    id: schema.posts.id,
    userId: schema.posts.userId,
    type: schema.posts.type,
    content: schema.posts.content,
    mediaUrls: schema.posts.mediaUrls,
    visibility: schema.posts.visibility,
    deletedAt: schema.posts.deletedAt,
    linkPreviewId: schema.posts.linkPreviewId,
    username: schema.users.username,
    authorAvatarUrl: schema.users.avatarUrl,
    authorIsPrivate: schema.users.isPrivate,
    userDeletedAt: schema.users.deletedAt,
  })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(eq(schema.posts.id, postId))
    .get();

  if (!row) {
    await deleteSharePreview(db, 'post', String(postId));
    return null;
  }

  const urls = getSharePreviewUrls(env, requestOrigin);
  const deleted = !!row.deletedAt || !!row.userDeletedAt;

  if (deleted) {
    await deleteSharePreview(db, 'post', String(postId));
    return null;
  }

  let pollQuestion: string | null = null;
  if (row.type === 'poll') {
    const poll = await db.select({ question: schema.polls.question })
      .from(schema.polls)
      .where(eq(schema.polls.postId, postId))
      .get();
    pollQuestion = poll?.question ?? null;
  }

  let linkPreviewImageUrl: string | null = null;
  if (row.linkPreviewId) {
    const preview = await db.select({ imageUrl: schema.linkPreviews.imageUrl })
      .from(schema.linkPreviews)
      .where(eq(schema.linkPreviews.id, row.linkPreviewId))
      .get();
    linkPreviewImageUrl = preview?.imageUrl ?? null;
  }

  const dto = buildPostSharePreviewFields({
    postId: row.id,
    username: row.username,
    content: row.content,
    type: row.type,
    pollQuestion,
    mediaUrls: row.mediaUrls,
    linkPreviewImageUrl,
    authorAvatarUrl: row.authorAvatarUrl,
    visibility: row.visibility ?? 'public',
    authorIsPrivate: !!(row.authorIsPrivate && row.authorIsPrivate !== 0),
    deleted,
    urls,
  });

  await upsertSharePreviewRow(db, dto);
  return dto;
}

export async function refreshProfileSharePreview(
  db: Db,
  username: string,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<SharePreviewDto | null> {
  const user = await db.select({
    username: schema.users.username,
    bio: schema.users.bio,
    avatarUrl: schema.users.avatarUrl,
    coverUrl: schema.users.coverUrl,
    isPrivate: schema.users.isPrivate,
    deletedAt: schema.users.deletedAt,
  })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();

  if (!user) {
    await deleteSharePreview(db, 'profile', username);
    return null;
  }

  const urls = getSharePreviewUrls(env, requestOrigin);
  const deleted = !!user.deletedAt;

  if (deleted) {
    await deleteSharePreview(db, 'profile', username);
    return null;
  }

  const dto = buildProfileSharePreviewFields({
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
    isPrivate: !!(user.isPrivate && user.isPrivate !== 0),
    deleted,
    urls,
  });

  await upsertSharePreviewRow(db, dto);
  return dto;
}

export async function refreshProfileSharePreviewByUserId(
  db: Db,
  userId: number,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<SharePreviewDto | null> {
  const user = await db.select({ username: schema.users.username })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return null;
  return refreshProfileSharePreview(db, user.username, env, requestOrigin);
}

export async function refreshPostSharePreviewsForUser(
  db: Db,
  userId: number,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<number> {
  const posts = await db.select({ id: schema.posts.id })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.userId, userId),
        isNull(schema.posts.parentPostId),
      ),
    )
    .all();

  for (const row of posts) {
    await refreshPostSharePreview(db, row.id, env, requestOrigin);
  }
  return posts.length;
}

function rowToDto(row: typeof schema.sharePreviews.$inferSelect): SharePreviewDto {
  return {
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    siteName: row.siteName,
    canonicalUrl: row.canonicalUrl,
    robots: row.robots,
    isPublic: row.isPublic === 1,
    resourceType: row.resourceType as ShareResourceType,
    resourceKey: row.resourceKey,
  };
}

export async function getSharePreview(
  db: Db,
  resourceType: ShareResourceType,
  resourceKey: string,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<SharePreviewDto | null> {
  const cached = await db.select()
    .from(schema.sharePreviews)
    .where(
      and(
        eq(schema.sharePreviews.resourceType, resourceType),
        eq(schema.sharePreviews.resourceKey, resourceKey),
      ),
    )
    .get();

  if (cached) {
    return rowToDto(cached);
  }

  if (resourceType === 'home') {
    return ensureHomeSharePreview(db, env, requestOrigin);
  }
  if (resourceType === 'post') {
    const postId = parseInt(resourceKey, 10);
    if (isNaN(postId)) return null;
    return refreshPostSharePreview(db, postId, env, requestOrigin);
  }
  if (resourceType === 'profile') {
    return refreshProfileSharePreview(db, resourceKey, env, requestOrigin);
  }

  return null;
}

export function buildSitemapXml(entries: { loc: string; lastmod?: string }[]): string {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod
      ? `\n    <lastmod>${escapeXml(entry.lastmod.split('T')[0])}</lastmod>`
      : '';
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function buildPublicSitemapEntries(
  db: Db,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<{ loc: string; lastmod?: string }[]> {
  await ensureHomeSharePreview(db, env, requestOrigin);

  const rows = await db.select({
    canonicalUrl: schema.sharePreviews.canonicalUrl,
    updatedAt: schema.sharePreviews.updatedAt,
  })
    .from(schema.sharePreviews)
    .where(eq(schema.sharePreviews.isPublic, 1))
    .orderBy(sql`${schema.sharePreviews.updatedAt} DESC`)
    .limit(50000)
    .all();

  return rows.map((row) => ({
    loc: row.canonicalUrl,
    lastmod: row.updatedAt,
  }));
}

export async function purgeStaleSharePreviews(db: Db): Promise<number> {
  const stalePosts = await db.select({ id: schema.sharePreviews.id })
    .from(schema.sharePreviews)
    .leftJoin(
      schema.posts,
      and(
        eq(schema.sharePreviews.resourceType, 'post'),
        eq(schema.sharePreviews.resourceKey, sql`CAST(${schema.posts.id} AS TEXT)`),
      ),
    )
    .leftJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(
      and(
        eq(schema.sharePreviews.resourceType, 'post'),
        sql`(
          ${schema.posts.id} IS NULL
          OR ${schema.posts.deletedAt} IS NOT NULL
          OR ${schema.posts.visibility} != 'public'
          OR ${schema.users.deletedAt} IS NOT NULL
          OR ${schema.users.isPrivate} != 0
          OR ${schema.posts.parentPostId} IS NOT NULL
        )`,
      ),
    )
    .all();

  const staleProfiles = await db.select({ id: schema.sharePreviews.id })
    .from(schema.sharePreviews)
    .leftJoin(
      schema.users,
      and(
        eq(schema.sharePreviews.resourceType, 'profile'),
        eq(schema.sharePreviews.resourceKey, schema.users.username),
      ),
    )
    .where(
      and(
        eq(schema.sharePreviews.resourceType, 'profile'),
        sql`(
          ${schema.users.id} IS NULL
          OR ${schema.users.deletedAt} IS NOT NULL
          OR ${schema.users.isPrivate} != 0
        )`,
      ),
    )
    .all();

  const staleIds = [...stalePosts, ...staleProfiles].map((r) => r.id);
  if (staleIds.length === 0) return 0;

  for (const id of staleIds) {
    await db.delete(schema.sharePreviews).where(eq(schema.sharePreviews.id, id)).run();
  }
  return staleIds.length;
}

export interface BackfillBatchResult {
  processed: number;
  nextCursor: number | null;
  done: boolean;
  phase: 'posts' | 'profiles' | 'purge';
}

export async function backfillSharePreviewsBatch(
  db: Db,
  env: SiteUrlEnv,
  requestOrigin: string | undefined,
  cursor: number,
  limit: number,
): Promise<BackfillBatchResult> {
  await ensureHomeSharePreview(db, env, requestOrigin);

  const publicPosts = await db.select({ id: schema.posts.id })
    .from(schema.posts)
    .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
    .where(
      and(
        eq(schema.posts.visibility, 'public'),
        eq(schema.users.isPrivate, 0),
        sql`${schema.posts.deletedAt} IS NULL`,
        sql`${schema.users.deletedAt} IS NULL`,
        isNull(schema.posts.parentPostId),
      ),
    )
    .orderBy(schema.posts.id)
    .all();

  if (cursor < publicPosts.length) {
    const slice = publicPosts.slice(cursor, cursor + limit);
    for (const row of slice) {
      await refreshPostSharePreview(db, row.id, env, requestOrigin);
    }
    return {
      processed: slice.length,
      nextCursor: cursor + slice.length,
      done: false,
      phase: 'posts',
    };
  }

  const publicProfiles = await db.select({ username: schema.users.username })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.isPrivate, 0),
        sql`${schema.users.deletedAt} IS NULL`,
      ),
    )
    .orderBy(schema.users.id)
    .all();

  const profileCursor = cursor - publicPosts.length;
  if (profileCursor < publicProfiles.length) {
    const slice = publicProfiles.slice(profileCursor, profileCursor + limit);
    for (const row of slice) {
      await refreshProfileSharePreview(db, row.username, env, requestOrigin);
    }
    return {
      processed: slice.length,
      nextCursor: publicPosts.length + profileCursor + slice.length,
      done: false,
      phase: 'profiles',
    };
  }

  const purged = await purgeStaleSharePreviews(db);
  return {
    processed: purged,
    nextCursor: null,
    done: true,
    phase: 'purge',
  };
}

/** @deprecated Use backfillSharePreviewsBatch for large datasets. */
export async function backfillAllSharePreviews(
  db: Db,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<{ posts: number; profiles: number; purged: number }> {
  let cursor = 0;
  let posts = 0;
  let profiles = 0;
  let purged = 0;
  const limit = 100;

  for (;;) {
    const batch = await backfillSharePreviewsBatch(db, env, requestOrigin, cursor, limit);
    if (batch.phase === 'posts') posts += batch.processed;
    if (batch.phase === 'profiles') profiles += batch.processed;
    if (batch.phase === 'purge') purged = batch.processed;
    if (batch.done) break;
    cursor = batch.nextCursor ?? 0;
  }

  return { posts, profiles, purged };
}

export async function getSharePreviewHealth(
  db: Db,
  env: SiteUrlEnv,
  requestOrigin?: string,
): Promise<{
  siteUrl: string;
  apiOrigin: string;
  cacheRowCount: number;
  publicRowCount: number;
}> {
  const urls = getSharePreviewUrls(env, requestOrigin);
  const [total, publicRows] = await Promise.all([
    db.select({ value: sql<number>`COUNT(*)` }).from(schema.sharePreviews).get(),
    db.select({ value: sql<number>`COUNT(*)` })
      .from(schema.sharePreviews)
      .where(eq(schema.sharePreviews.isPublic, 1))
      .get(),
  ]);

  return {
    siteUrl: urls.siteUrl,
    apiOrigin: urls.apiOrigin,
    cacheRowCount: Number(total?.value ?? 0),
    publicRowCount: Number(publicRows?.value ?? 0),
  };
}

export function parseSharePath(pathname: string): { type: ShareResourceType; key: string } | null {
  const postMatch = pathname.match(/^\/post\/(\d+)\/?$/);
  if (postMatch) {
    return { type: 'post', key: postMatch[1] };
  }

  const profileMatch = pathname.match(/^\/profile\/([^/]+)\/?$/);
  if (profileMatch) {
    return { type: 'profile', key: decodeURIComponent(profileMatch[1]) };
  }

  const olabidMatch = pathname.match(/^\/olabid\/(\d+)\/?$/);
  if (olabidMatch) {
    return { type: 'olabid', key: olabidMatch[1] };
  }

  if (pathname === '/' || pathname === '') {
    return { type: 'home', key: 'home' };
  }

  return null;
}
