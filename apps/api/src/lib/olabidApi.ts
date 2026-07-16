/**
 * Olabid API client using their API key
 * Discovered from HTTP Toolkit: Olabid uses x-api-key header for authentication
 */

const OLABID_CLIENT_VERSION = 'PRODUCTION-v3.0.2-375695';
const OLABID_API_BASE = 'https://auction-api.olabid.com/api/v2';

export interface OlabidItem {
  id: number;
  sku: string;
  name: string;
  currentBidderId?: number;
  currentBidAmount: number;
  nextBidAmount: number;
  numberOfBids: number;
  retailPrice: number;
  auctionEndsAt: string;
  auctionFinishesInMs: number;
  condition: string;
  conditionNote?: string;
  status: string;
  images: Array<{
    url: string;
    smallUrl: string;
    mediumUrl: string;
    largeUrl: string;
    xLargeUrl: string;
    mediaType: string;
  }>;
  shippingIsUnavailable: boolean;
  inWatchlist: boolean;
  isPaid: boolean;
  amazonLink?: string;
  shippingIsFree?: boolean;
  pickupIsUnavailable?: boolean;
  isWithoutFees?: boolean;
}

export interface OlabidListItem {
  id: number;
  name: string;
  retailPrice: number;
  currentBidderId?: number;
  currentBidAmount: number;
  nextBidAmount: number;
  inWatchlist: boolean;
  auctionEndsAt: string;
  auctionFinishesInMs: number;
  previewBlobUrl?: string;
  status: string;
  shippingIsUnavailable?: boolean;
  shippingIsFree?: boolean;
  pickupIsUnavailable?: boolean;
  isWithoutFees?: boolean;
}

export interface OlabidListResponse {
  pageContext: {
    page: number;
    size: number;
  };
  items: OlabidListItem[];
}

export interface OlabidCategory {
  id: number;
  name: string;
}

export interface OlabidWarehouse {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface OlabidWarehouseListResponse {
  pageContext: {
    pages: number;
    totalItems: number;
    page: number;
    size: number;
  };
  items: OlabidWarehouse[];
}

export type OlabidSectionFilter = 'topDeals' | 'trending' | 'freeShipping' | 'noFees';

let cachedWarehouseIds: string | null = null;
let warehouseCacheExpiresAt = 0;
const WAREHOUSE_CACHE_MS = 5 * 60 * 1000;

function buildOlabidHeaders(apiKey: string) {
  return {
    'x-api-key': apiKey,
    'x-client-version': OLABID_CLIENT_VERSION,
    accept: 'application/json',
  };
}

function logAuthFailure(status: number) {
  if (status === 401 || status === 403) {
    console.error('⚠️ OLABID API KEY MAY BE EXPIRED! Status:', status);
    console.error('📝 Update the OLABID_API_KEY secret in Cloudflare Workers');
    console.error('🔧 Use HTTP Toolkit to capture the new key from Olabid app');
  }
}

function sanitizeError(error: unknown): string {
  return 'An error occurred while processing your request';
}

/**
 * Parse Olabid item ID from various URL formats:
 * - https://link.olabid.com/item-details?id=12680280
 * - https://www.olabid.com/item/12680280
 * - etc.
 */
export function parseOlabidItemId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('olabid.com')) return null;

    // Check query parameter ?id=
    const idParam = u.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) return idParam;

    // Check path segments like /item/12680280
    const pathMatch = u.pathname.match(/\/(?:item|item-details|auction-items)\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch item details from Olabid API
 * Note: The API uses /auction-items/{id}/details endpoint
 */
export async function fetchOlabidItem(itemId: string, apiKey: string): Promise<OlabidItem | null> {
  if (!apiKey) {
    console.error('OLABID_API_KEY is not configured');
    return null;
  }

  try {
    const response = await fetch(`${OLABID_API_BASE}/auction-items/${itemId}/details`, {
      headers: buildOlabidHeaders(apiKey),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logAuthFailure(response.status);
      console.warn(`Olabid API returned ${response.status} for item ${itemId}`);
      return null;
    }

    const data = await response.json();
    return data as OlabidItem;
  } catch (error) {
    console.error(sanitizeError(error));
    return null;
  }
}

/**
 * Fetch product categories from Olabid API
 */
export async function fetchOlabidCategories(apiKey: string): Promise<OlabidCategory[] | null> {
  if (!apiKey) {
    console.error('OLABID_API_KEY is not configured');
    return null;
  }

  try {
    const response = await fetch(`${OLABID_API_BASE}/categories`, {
      headers: buildOlabidHeaders(apiKey),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logAuthFailure(response.status);
      console.warn(`Olabid categories API returned ${response.status}`);
      return null;
    }

    return (await response.json()) as OlabidCategory[];
  } catch (error) {
    console.error(sanitizeError(error));
    return null;
  }
}

/**
 * Fetch warehouses from Olabid API
 */
export async function fetchOlabidWarehouses(apiKey: string): Promise<OlabidWarehouse[] | null> {
  if (!apiKey) {
    console.error('OLABID_API_KEY is not configured');
    return null;
  }

  try {
    const response = await fetch(`${OLABID_API_BASE}/warehouses/list`, {
      headers: buildOlabidHeaders(apiKey),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logAuthFailure(response.status);
      console.warn(`Olabid warehouses API returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as OlabidWarehouseListResponse;
    return data.items ?? [];
  } catch (error) {
    console.error(sanitizeError(error));
    return null;
  }
}

/**
 * Resolve warehouse IDs from the live warehouses list (cached briefly).
 */
export async function resolveWarehouseIds(apiKey: string, explicit?: string): Promise<string | null> {
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const now = Date.now();
  if (cachedWarehouseIds && now < warehouseCacheExpiresAt) {
    return cachedWarehouseIds;
  }

  const warehouses = await fetchOlabidWarehouses(apiKey);
  if (!warehouses || warehouses.length === 0) {
    return null;
  }

  cachedWarehouseIds = warehouses.map((w) => String(w.id)).join(',');
  warehouseCacheExpiresAt = now + WAREHOUSE_CACHE_MS;
  return cachedWarehouseIds;
}

export interface FetchOlabidListOptions {
  warehouseIds?: string; // comma-separated IDs from /warehouses/list
  orderBy?: string; // e.g., "(EndTime:asc)", "(NextBid:asc)", "(RetailPrice:desc)"
  isPickupSelected?: boolean;
  shipping?: boolean;
  page?: number;
  size?: number;
  searchPattern?: string; // Search query
  searchPriority?: 'first' | 'last';
  minRetailPrice?: number; // Minimum retail price filter
  maxRetailPrice?: number; // Maximum retail price filter
  categoryIds?: string; // e.g., "1" or "1,3,5"
}

export interface FetchOlabidSectionOptions {
  filterBy: OlabidSectionFilter;
  warehouseIds?: string;
  shipping?: boolean;
  page?: number;
  size?: number;
}

/**
 * Fetch home-section auction items (topDeals, trending, freeShipping, noFees)
 */
export async function fetchOlabidBySection(
  apiKey: string,
  options: FetchOlabidSectionOptions
): Promise<OlabidListResponse | null> {
  if (!apiKey) {
    console.error('OLABID_API_KEY is not configured');
    return null;
  }

  const {
    filterBy,
    shipping = true,
    page = 1,
    size = 20,
  } = options;

  const warehouseIds = await resolveWarehouseIds(apiKey, options.warehouseIds);
  if (!warehouseIds) {
    console.warn('Olabid by-section: no warehouse IDs available');
    return null;
  }

  try {
    const url = new URL(`${OLABID_API_BASE}/auction-items/by-section`);
    url.searchParams.set('filterBy', filterBy);
    url.searchParams.set('warehouseIds', warehouseIds);
    url.searchParams.set('shipping', String(shipping));
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(size));

    const response = await fetch(url.toString(), {
      headers: buildOlabidHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logAuthFailure(response.status);
      console.warn(`Olabid by-section API returned ${response.status}`);
      return null;
    }

    return (await response.json()) as OlabidListResponse;
  } catch (error) {
    console.error(sanitizeError(error));
    return null;
  }
}

/**
 * Fetch list of auction items from Olabid API
 */
export async function fetchOlabidList(
  apiKey: string,
  options: FetchOlabidListOptions = {}
): Promise<OlabidListResponse | null> {
  if (!apiKey) {
    console.error('OLABID_API_KEY is not configured');
    return null;
  }

  const {
    orderBy = '(EndTime:asc)',
    isPickupSelected = true,
    shipping = true,
    page = 1,
    size = 20,
    searchPattern,
    searchPriority = 'first',
    minRetailPrice,
    maxRetailPrice,
    categoryIds,
  } = options;

  const warehouseIds = await resolveWarehouseIds(apiKey, options.warehouseIds);
  if (!warehouseIds) {
    console.warn('Olabid list: no warehouse IDs available');
    return null;
  }

  try {
    const url = new URL(`${OLABID_API_BASE}/auction-items/list`);
    url.searchParams.set('warehouseIds', warehouseIds);
    url.searchParams.set('orderBy', orderBy);
    url.searchParams.set('isPickupSelected', String(isPickupSelected));
    url.searchParams.set('shipping', String(shipping));
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(size));

    if (categoryIds) {
      url.searchParams.set('categoryIds', categoryIds);
    }

    if (searchPattern) {
      url.searchParams.set('searchPattern', searchPattern);
      url.searchParams.set('searchPriority', searchPriority);
    }

    if (minRetailPrice !== undefined && minRetailPrice > 0) {
      url.searchParams.set('minRetailPrice', String(minRetailPrice));
    }
    if (maxRetailPrice !== undefined && maxRetailPrice > 0) {
      url.searchParams.set('maxRetailPrice', String(maxRetailPrice));
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        ...buildOlabidHeaders(apiKey),
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logAuthFailure(response.status);
      console.warn(`Olabid list API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data as OlabidListResponse;
  } catch (error) {
    console.error(sanitizeError(error));
    return null;
  }
}
