import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, isNull, inArray } from 'drizzle-orm';
import * as schema from '@hin/db';
import { ItemComment, Notification, CreateItemCommentSchema } from '@hin/types';
import type { Env } from '../types';
import {
  fetchOlabidList,
  fetchOlabidItem,
  fetchOlabidCategories,
  fetchOlabidWarehouses,
  fetchOlabidBySection,
  type OlabidSectionFilter,
} from '../lib/olabidApi';
import {
  upsertOlabidItemSnapshot,
  getOlabidItemSnapshot,
  ensureOlabidItemStub,
  getItemCommentCounts,
} from '../lib/olabidItems';
import { getAuthUser } from '../lib/auth';
import { getHiddenAuthorIds, shouldDeliverNotification } from '../lib/blocks';
import { getOrCreateUserSettings, isNotificationEnabled } from '../lib/user-settings';
import { processUserActionSafe } from '../lib/gamification/hub';
import { isGamificationEnabled, getGamificationVisibility } from '../lib/gamification/settings';
import { toGamificationBlock } from '../lib/gamification/public';
import { loadEquippedBadgesForUsers } from '../lib/gamification/equipped';
import { isOlabidEnabled } from '../lib/system-settings';

const olabid = new Hono<{ Bindings: Env }>();

const SECTION_FILTERS = new Set<OlabidSectionFilter>([
  'topDeals',
  'trending',
  'freeShipping',
  'noFees',
]);

function noStoreJson<T>(c: { header: (name: string, value: string) => void; json: (data: T, status?: number) => Response }, data: T, status = 200) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  c.header('Pragma', 'no-cache');
  return c.json(data, status);
}

/** Kill-switch: every public and authenticated Olabid route returns 404 when off — no upstream calls. */
olabid.use('*', async (c, next) => {
  const db = drizzle(c.env.DB, { schema });
  if (!(await isOlabidEnabled(db))) {
    return noStoreJson(c, { error: 'Not found' }, 404);
  }
  return next();
});

/**
 * GET /api/olabid/categories
 * Fetch product categories
 */
olabid.get('/categories', async (c) => {
  const apiKey = c.env.OLABID_API_KEY;
  
  if (!apiKey) {
    return noStoreJson(c, { error: 'Service temporarily unavailable' }, 503);
  }

  const categories = await fetchOlabidCategories(apiKey);

  if (!categories) {
    return noStoreJson(c, { error: 'Unable to retrieve categories at this time' }, 500);
  }

  return noStoreJson(c, categories);
});

/**
 * GET /api/olabid/warehouses
 * Fetch pickup warehouses
 */
olabid.get('/warehouses', async (c) => {
  const apiKey = c.env.OLABID_API_KEY;
  
  if (!apiKey) {
    return noStoreJson(c, { error: 'Service temporarily unavailable' }, 503);
  }

  const warehouses = await fetchOlabidWarehouses(apiKey);

  if (!warehouses) {
    return noStoreJson(c, { error: 'Unable to retrieve warehouses at this time' }, 500);
  }

  return noStoreJson(c, warehouses);
});

/**
 * GET /api/olabid/items
 * Fetch list of auction items with optional search, category, section, and filters
 */
olabid.get('/items', async (c) => {
  const apiKey = c.env.OLABID_API_KEY;
  
  if (!apiKey) {
    return noStoreJson(c, { error: 'Service temporarily unavailable' }, 503);
  }

  const page = parseInt(c.req.query('page') || '1', 10);
  const size = parseInt(c.req.query('size') || '20', 10);
  const orderBy = c.req.query('orderBy') || '(EndTime:asc)';
  const searchPattern = c.req.query('searchPattern');
  const minRetailPrice = c.req.query('minRetailPrice');
  const maxRetailPrice = c.req.query('maxRetailPrice');
  const categoryIds = c.req.query('categoryIds');
  const warehouseIds = c.req.query('warehouseIds') || undefined;
  const filterBy = c.req.query('filterBy');

  // Home sections use a different Olabid endpoint
  if (filterBy) {
    if (!SECTION_FILTERS.has(filterBy as OlabidSectionFilter)) {
      return noStoreJson(
        c,
        { error: `Invalid filterBy. Use one of: ${[...SECTION_FILTERS].join(', ')}` },
        400
      );
    }

    const result = await fetchOlabidBySection(apiKey, {
      filterBy: filterBy as OlabidSectionFilter,
      warehouseIds,
      page,
      size,
    });

    if (!result) {
      return noStoreJson(c, { error: 'Unable to retrieve auction items at this time' }, 500);
    }

    return noStoreJson(c, result);
  }

  const result = await fetchOlabidList(apiKey, {
    page,
    size,
    orderBy,
    warehouseIds,
    searchPattern: searchPattern || undefined,
    minRetailPrice: minRetailPrice ? parseInt(minRetailPrice, 10) : undefined,
    maxRetailPrice: maxRetailPrice ? parseInt(maxRetailPrice, 10) : undefined,
    categoryIds: categoryIds || undefined,
  });

  if (!result) {
    return noStoreJson(c, { error: 'Unable to retrieve auction items at this time' }, 500);
  }

  return noStoreJson(c, result);
});

/**
 * GET /api/olabid/items/bookmark-status?ids=1,2,3
 * Returns a map of itemId → true for items the current user has bookmarked.
 * Registered before /items/:id so "bookmark-status" isn't swallowed by :id.
 */
olabid.get('/items/bookmark-status', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return noStoreJson(c, { error: 'Unauthorized' }, 401);

  const idsParam = c.req.query('ids') || '';
  const ids = idsParam
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n));

  if (ids.length === 0) return noStoreJson(c, {});

  const db = drizzle(c.env.DB, { schema });
  const rows = await db
    .select({ olabidItemId: schema.itemBookmarks.olabidItemId })
    .from(schema.itemBookmarks)
    .where(
      and(
        eq(schema.itemBookmarks.userId, authUser.id),
        isNull(schema.itemBookmarks.deletedAt),
        inArray(schema.itemBookmarks.olabidItemId, ids),
      ),
    )
    .all();

  const status: Record<number, boolean> = {};
  for (const row of rows) status[row.olabidItemId] = true;
  return noStoreJson(c, status);
});

/**
 * GET /api/olabid/items/comment-counts?ids=1,2,3
 * Batch discussion-comment counts for listing cards. Registered before
 * /items/:id so "comment-counts" isn't swallowed by the :id param route.
 */
olabid.get('/items/comment-counts', async (c) => {
  const idsParam = c.req.query('ids') || '';
  const ids = idsParam
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n));

  if (ids.length === 0) return noStoreJson(c, {});

  const db = drizzle(c.env.DB, { schema });
  const counts = await getItemCommentCounts(db, ids);
  return noStoreJson(c, counts);
});

/**
 * POST /api/olabid/items/:id/bookmark
 * Toggle bookmark / watchlist for an auction item (Hin-side).
 */
olabid.post('/items/:id/bookmark', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return noStoreJson(c, { error: 'Unauthorized' }, 401);

  const olabidItemId = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(olabidItemId)) return noStoreJson(c, { error: 'Invalid item ID' }, 400);

  const db = drizzle(c.env.DB, { schema });
  await ensureOlabidItemStub(db, olabidItemId);

  const existing = await db
    .select()
    .from(schema.itemBookmarks)
    .where(
      and(
        eq(schema.itemBookmarks.olabidItemId, olabidItemId),
        eq(schema.itemBookmarks.userId, authUser.id),
      ),
    )
    .get();

  let bookmarked = false;
  if (existing) {
    if (!existing.deletedAt) {
      await db
        .update(schema.itemBookmarks)
        .set({ deletedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.itemBookmarks.olabidItemId, olabidItemId),
            eq(schema.itemBookmarks.userId, authUser.id),
          ),
        )
        .run();
    } else {
      await db
        .update(schema.itemBookmarks)
        .set({ deletedAt: null })
        .where(
          and(
            eq(schema.itemBookmarks.olabidItemId, olabidItemId),
            eq(schema.itemBookmarks.userId, authUser.id),
          ),
        )
        .run();
      bookmarked = true;
    }
  } else {
    await db
      .insert(schema.itemBookmarks)
      .values({
        olabidItemId,
        userId: authUser.id,
      })
      .run();
    bookmarked = true;
  }

  return noStoreJson(c, { bookmarked });
});

/**
 * GET /api/olabid/items/:id
 * Fetch single item details. Falls back to the last saved local snapshot when
 * the live Olabid API can't be reached (auction ended, key issues, etc.) so
 * permalinks and discussion keep working.
 */
olabid.get('/items/:id', async (c) => {
  const apiKey = c.env.OLABID_API_KEY;
  const itemId = c.req.param('id');

  if (!itemId || !/^\d+$/.test(itemId)) {
    return noStoreJson(c, { error: 'Invalid item ID' }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const item = apiKey ? await fetchOlabidItem(itemId, apiKey) : null;

  let hasBookmarked = false;
  if (authUser) {
    const bookmark = await db
      .select({ olabidItemId: schema.itemBookmarks.olabidItemId })
      .from(schema.itemBookmarks)
      .where(
        and(
          eq(schema.itemBookmarks.userId, authUser.id),
          eq(schema.itemBookmarks.olabidItemId, parseInt(itemId, 10)),
          isNull(schema.itemBookmarks.deletedAt),
        ),
      )
      .get();
    hasBookmarked = !!bookmark;
  }

  if (item) {
    try {
      await upsertOlabidItemSnapshot(db, item);
    } catch (e) {}
    return noStoreJson(c, { ...item, source: 'live', hasBookmarked });
  }

  const snapshot = await getOlabidItemSnapshot(db, parseInt(itemId, 10));
  if (snapshot) {
    return noStoreJson(c, { ...snapshot, id: snapshot.externalId, source: 'snapshot', hasBookmarked });
  }

  return noStoreJson(c, { error: 'Item not found' }, 404);
});

/**
 * GET /api/olabid/items/:id/comments
 * List discussion comments for an Olabid item (flat list, client builds the reply tree).
 */
olabid.get('/items/:id/comments', async (c) => {
  const olabidItemId = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(olabidItemId)) return noStoreJson(c, { error: 'Invalid item ID' }, 400);

  const db = drizzle(c.env.DB, { schema });
  const authUser = await getAuthUser(c);
  const currentUserId = authUser ? authUser.id : null;

  const rows = await db
    .select({
      id: schema.itemComments.id,
      olabidItemId: schema.itemComments.olabidItemId,
      userId: schema.itemComments.userId,
      parentId: schema.itemComments.parentId,
      content: schema.itemComments.content,
      createdAt: schema.itemComments.createdAt,
      deletedAt: schema.itemComments.deletedAt,
      username: schema.users.username,
    })
    .from(schema.itemComments)
    .innerJoin(schema.users, eq(schema.itemComments.userId, schema.users.id))
    .where(eq(schema.itemComments.olabidItemId, olabidItemId))
    .orderBy(desc(schema.itemComments.createdAt))
    .all();

  const commentIds = rows.map(r => r.id);
  const activeLikes = commentIds.length
    ? await db
        .select({
          commentId: schema.itemCommentLikes.commentId,
          userId: schema.itemCommentLikes.userId,
        })
        .from(schema.itemCommentLikes)
        .where(
          and(
            inArray(schema.itemCommentLikes.commentId, commentIds),
            isNull(schema.itemCommentLikes.deletedAt)
          )
        )
        .all()
    : [];

  const likesCountByComment = new Map<number, number>();
  const likedByCurrentUser = new Set<number>();
  for (const like of activeLikes) {
    likesCountByComment.set(like.commentId, (likesCountByComment.get(like.commentId) || 0) + 1);
    if (currentUserId && like.userId === currentUserId) {
      likedByCurrentUser.add(like.commentId);
    }
  }

  const hiddenIds = currentUserId ? await getHiddenAuthorIds(db, currentUserId) : [];
  const visibleRows = hiddenIds.length > 0 ? rows.filter(r => !hiddenIds.includes(r.userId)) : rows;

  const equippedBadgesByUser = (await isGamificationEnabled(db))
    ? await loadEquippedBadgesForUsers(db, visibleRows.map(r => r.userId))
    : new Map();

  const comments: ItemComment[] = visibleRows.map(row => {
    const likesCount = likesCountByComment.get(row.id) || 0;
    const hasLiked = likedByCurrentUser.has(row.id);
    if (row.deletedAt) {
      return { ...row, content: '[Comment deleted]', username: 'deleted', likesCount, hasLiked };
    }
    return { ...row, likesCount, hasLiked, authorEquippedBadges: equippedBadgesByUser.get(row.userId) ?? [] };
  });

  return noStoreJson(c, comments);
});

/**
 * POST /api/olabid/items/:id/comments
 * Create a discussion comment (or reply) on an Olabid item.
 */
olabid.post('/items/:id/comments', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

  const olabidItemId = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(olabidItemId)) return c.json({ error: 'Invalid item ID' }, 400);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateItemCommentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.errors[0]?.message || 'Invalid comment' }, 400);
  }
  const { content, parentId } = parsed.data;

  const db = drizzle(c.env.DB, { schema });
  await ensureOlabidItemStub(db, olabidItemId);

  const [inserted] = await db.insert(schema.itemComments).values({
    olabidItemId,
    userId: authUser.id,
    parentId: parentId || null,
    content: content.trim(),
  }).returning();

  const authorEquippedBadges = (await isGamificationEnabled(db))
    ? await loadEquippedBadgesForUsers(db, [authUser.id]).then(m => m.get(authUser.id) ?? [])
    : [];

  const commentResponse: ItemComment = {
    id: inserted.id,
    olabidItemId: inserted.olabidItemId,
    userId: authUser.id,
    username: authUser.username,
    parentId: inserted.parentId,
    content: inserted.content,
    createdAt: inserted.createdAt,
    deletedAt: inserted.deletedAt,
    likesCount: 0,
    hasLiked: false,
    authorEquippedBadges,
  };

  // Notify the parent comment's author on a reply.
  if (parentId) {
    const parentComment = await db.select().from(schema.itemComments).where(eq(schema.itemComments.id, parentId)).get();
    if (parentComment && parentComment.userId !== authUser.id) {
      const recipientSettings = await getOrCreateUserSettings(db, parentComment.userId);
      if (
        isNotificationEnabled(recipientSettings, 'comment')
        && await shouldDeliverNotification(db, parentComment.userId, authUser.id)
      ) {
        const notificationContent = `${authUser.username} replied to your comment: "${content.substring(0, 20)}${content.length > 20 ? '...' : ''}"`;
        const [notif] = await db.insert(schema.notifications).values({
          userId: parentComment.userId,
          senderId: authUser.id,
          type: 'comment',
          entityType: 'olabid_item',
          entityId: olabidItemId,
          commentId: inserted.id,
          content: notificationContent,
          read: 0,
        }).returning();

        const notifPayload: Notification = {
          id: notif.id,
          userId: parentComment.userId,
          senderId: authUser.id,
          senderUsername: authUser.username,
          type: 'comment',
          entityType: 'olabid_item',
          entityId: olabidItemId,
          commentId: inserted.id,
          content: notificationContent,
          read: false,
          createdAt: notif.createdAt,
        };

        try {
          const doId = c.env.REALTIME_DO.idFromName('global');
          const doStub = c.env.REALTIME_DO.get(doId);
          await doStub.fetch(new Request('http://realtime/broadcast-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: parentComment.userId, notification: notifPayload }),
          }));
        } catch (e) {}
      }
    }
  }

  try {
    const doId = c.env.REALTIME_DO.idFromName('global');
    const doStub = c.env.REALTIME_DO.get(doId);
    await doStub.fetch(new Request('http://realtime/broadcast-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'item_comment_created', payload: { comment: commentResponse } }),
    }));
  } catch (e) {}

  const gResult = await processUserActionSafe(
    db,
    c.env,
    authUser.id,
    'comment_created',
    { olabidItemId, commentId: inserted.id },
    authUser.username,
  );
  const g = toGamificationBlock(gResult, await getGamificationVisibility(db));

  return c.json({ ...commentResponse, g });
});

export default olabid;
