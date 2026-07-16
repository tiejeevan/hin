import { Hono } from 'hono';
import type { Env } from '../types';
import {
  fetchOlabidList,
  fetchOlabidItem,
  fetchOlabidCategories,
  fetchOlabidWarehouses,
  fetchOlabidBySection,
  type OlabidSectionFilter,
} from '../lib/olabidApi';

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

/**
 * GET /api/olabid/categories
 * Fetch product categories
 */
olabid.get('/categories', async (c) => {
  const categories = await fetchOlabidCategories();

  if (!categories) {
    return noStoreJson(c, { error: 'Failed to fetch categories' }, 500);
  }

  return noStoreJson(c, categories);
});

/**
 * GET /api/olabid/warehouses
 * Fetch pickup warehouses
 */
olabid.get('/warehouses', async (c) => {
  const warehouses = await fetchOlabidWarehouses();

  if (!warehouses) {
    return noStoreJson(c, { error: 'Failed to fetch warehouses' }, 500);
  }

  return noStoreJson(c, warehouses);
});

/**
 * GET /api/olabid/items
 * Fetch list of auction items with optional search, category, section, and filters
 */
olabid.get('/items', async (c) => {
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

    const result = await fetchOlabidBySection({
      filterBy: filterBy as OlabidSectionFilter,
      warehouseIds,
      page,
      size,
    });

    if (!result) {
      return noStoreJson(c, { error: 'Failed to fetch auction items' }, 500);
    }

    return noStoreJson(c, result);
  }

  const result = await fetchOlabidList({
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
    return noStoreJson(c, { error: 'Failed to fetch auction items' }, 500);
  }

  return noStoreJson(c, result);
});

/**
 * GET /api/olabid/items/:id
 * Fetch single item details
 */
olabid.get('/items/:id', async (c) => {
  const itemId = c.req.param('id');

  if (!itemId || !/^\d+$/.test(itemId)) {
    return noStoreJson(c, { error: 'Invalid item ID' }, 400);
  }

  const item = await fetchOlabidItem(itemId);

  if (!item) {
    return noStoreJson(c, { error: 'Item not found' }, 404);
  }

  return noStoreJson(c, item);
});

export default olabid;
