import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@hin/db';
import { parseOlabidItemId, fetchOlabidItem } from './olabidApi';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const URL_RE = /(https?:\/\/[^\s<>"')]+)/i;
const FETCH_TIMEOUT_MS = 3000;
const MAX_HTML_BYTES = 300 * 1024;
/** Reuse a successful preview for this long before refetching. */
const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** Skip re-fetching a URL that just failed for this long. */
const FAILURE_BACKOFF_MS = 60 * 60 * 1000;

/** First http(s) URL in text, with trailing prose punctuation trimmed. */
export function parseFirstUrl(content: string): string | null {
  const match = content.match(URL_RE);
  if (!match) return null;
  const url = match[1].replace(/[.,!?;:)\]}>'"]+$/, '');
  return url || null;
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** Best-effort SSRF guard — blocks obviously local/private hostnames. No DNS-rebinding protection. */
function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;

  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = parseInt(ipv4[1], 10);
    const b = parseInt(ipv4[2], 10);
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

async function hashUrl(url: string): Promise<string> {
  const data = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Read at most `capBytes` from a stream, then cancel it — bounds memory/time for huge pages. */
async function readCapped(stream: ReadableStream<Uint8Array>, capBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < capBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* stream already closed */ }
  }

  const out = new Uint8Array(Math.min(total, capBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = out.length - offset;
    if (remaining <= 0) break;
    out.set(chunk.subarray(0, Math.min(chunk.length, remaining)), offset);
    offset += Math.min(chunk.length, remaining);
  }
  return out;
}

interface ExtractedMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

/** Extract Open Graph (fallback: <title>) metadata using Workers' native HTMLRewriter. */
function extractMetadata(html: Uint8Array): Promise<ExtractedMetadata> {
  return new Promise((resolve) => {
    const meta: ExtractedMetadata & { fallbackTitle?: string } = {};

    const rewriter = new HTMLRewriter()
      .on('meta', {
        element(el) {
          const property = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
          const content = el.getAttribute('content');
          if (!property || !content) return;
          if (property === 'og:title') meta.title = content;
          else if (property === 'og:description' || (property === 'description' && !meta.description)) meta.description = content;
          else if (property === 'og:image') meta.imageUrl = content;
          else if (property === 'og:site_name') meta.siteName = content;
        },
      })
      .on('title', {
        text(text) {
          meta.fallbackTitle = (meta.fallbackTitle || '') + text.text;
        },
      });

    const response = rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    response.text()
      .then(() => resolve({
        title: meta.title || meta.fallbackTitle?.trim() || undefined,
        description: meta.description,
        imageUrl: meta.imageUrl,
        siteName: meta.siteName,
      }))
      .catch(() => resolve({}));
  });
}

/**
 * Fetch Olabid item preview using their API.
 */
async function fetchOlabidPreview(
  db: Db,
  normalized: string,
  itemId: string
): Promise<ExtractedMetadata> {
  const itemData = await fetchOlabidItem(itemId);

  if (!itemData) {
    throw new Error('Item not found');
  }

  // Format description with key auction details
  const description = [
    itemData.name,
    `Current Bid: $${itemData.currentBidAmount}`,
    `Retail: $${itemData.retailPrice}`,
    `Condition: ${itemData.condition}`,
    itemData.conditionNote || '',
  ].filter(Boolean).join(' • ');

  return {
    title: `${itemData.name} - Olabid Auction`,
    description,
    imageUrl: itemData.images?.[0]?.largeUrl || itemData.images?.[0]?.url || null,
    siteName: 'Olabid',
  };
}

/**
 * Look up (or fetch + cache) an Open Graph preview for a URL.
 * Never throws — any failure is recorded and `null` is returned so post creation is unaffected.
 * 
 * Supports special handling for Olabid auction links.
 */
export async function getOrFetchLinkPreview(
  db: Db,
  rawUrl: string
): Promise<number | null> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return null;

  let hostname: string;
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    return null;
  }
  if (isBlockedHostname(hostname)) return null;

  const urlHash = await hashUrl(normalized);
  const existing = await db.select().from(schema.linkPreviews).where(eq(schema.linkPreviews.urlHash, urlHash)).get();
  const olabidItemId = parseOlabidItemId(normalized);
  // Stale OG scrapes for Olabid (siteName != Olabid) must be refetched via their API.
  const olabidNeedsRefresh = Boolean(
    olabidItemId && existing && !existing.fetchFailed && existing.siteName !== 'Olabid'
  );

  if (existing && !olabidNeedsRefresh) {
    const ageMs = Date.now() - new Date(existing.fetchedAt).getTime();
    if (!existing.fetchFailed && ageMs < CACHE_FRESH_MS) return existing.id;
    if (existing.fetchFailed && ageMs < FAILURE_BACKOFF_MS) return null;
  }

  try {
    let meta: ExtractedMetadata;

    // Check if this is an Olabid link
    if (olabidItemId) {
      try {
        meta = await fetchOlabidPreview(db, normalized, olabidItemId);
      } catch (olabidError) {
        console.warn(`Olabid preview failed, falling back to Open Graph: ${olabidError}`);
        // Fall back to regular Open Graph scraping
        const res = await fetch(normalized, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HinLinkPreviewBot/1.0; +https://hin.app)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });

        const finalHostname = new URL(res.url || normalized).hostname;
        if (isBlockedHostname(finalHostname)) throw new Error('Blocked host after redirect');

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || !contentType.includes('text/html') || !res.body) {
          throw new Error(`Unsupported response: ${res.status} ${contentType}`);
        }

        const bytes = await readCapped(res.body, MAX_HTML_BYTES);
        meta = await extractMetadata(bytes);
      }
    } else {
      // Regular Open Graph scraping
      const res = await fetch(normalized, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HinLinkPreviewBot/1.0; +https://hin.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      const finalHostname = new URL(res.url || normalized).hostname;
      if (isBlockedHostname(finalHostname)) throw new Error('Blocked host after redirect');

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !contentType.includes('text/html') || !res.body) {
        throw new Error(`Unsupported response: ${res.status} ${contentType}`);
      }

      const bytes = await readCapped(res.body, MAX_HTML_BYTES);
      meta = await extractMetadata(bytes);
    }

    if (existing) {
      await db.update(schema.linkPreviews).set({
        url: normalized,
        title: meta.title ?? null,
        description: meta.description ?? null,
        imageUrl: meta.imageUrl ?? null,
        siteName: meta.siteName ?? null,
        fetchedAt: new Date().toISOString(),
        fetchFailed: 0,
      }).where(eq(schema.linkPreviews.id, existing.id)).run();
      return existing.id;
    }

    const [inserted] = await db.insert(schema.linkPreviews).values({
      urlHash,
      url: normalized,
      title: meta.title ?? null,
      description: meta.description ?? null,
      imageUrl: meta.imageUrl ?? null,
      siteName: meta.siteName ?? null,
      fetchFailed: 0,
    }).returning();
    return inserted.id;
  } catch (_e) {
    try {
      if (existing) {
        await db.update(schema.linkPreviews)
          .set({ fetchedAt: new Date().toISOString(), fetchFailed: 1 })
          .where(eq(schema.linkPreviews.id, existing.id))
          .run();
      } else {
        await db.insert(schema.linkPreviews).values({ urlHash, url: normalized, fetchFailed: 1 }).onConflictDoNothing().run();
      }
    } catch { /* best-effort bookkeeping only */ }
    return null;
  }
}
