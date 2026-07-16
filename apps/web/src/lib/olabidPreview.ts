import type { LinkPreview } from '@hin/types';
import { olabidItemPermalinkUrl } from './appRoutes';

/** Minimal auction fields needed to seed a rich link preview without waiting on the API. */
export interface OlabidPreviewSource {
  id: number;
  name: string;
  currentBidAmount?: number;
  retailPrice?: number;
  condition?: string;
  previewBlobUrl?: string | null;
  imageUrl?: string | null;
  images?: Array<{ url?: string; largeUrl?: string; mediumUrl?: string }>;
}

/**
 * Build an immediate Olabid link preview from item data already on the client.
 * Used when sharing to chat / creating a post so the composer shows details right away.
 */
export function buildOlabidLinkPreview(item: OlabidPreviewSource): LinkPreview {
  const imageUrl =
    item.previewBlobUrl ||
    item.imageUrl ||
    item.images?.[0]?.largeUrl ||
    item.images?.[0]?.mediumUrl ||
    item.images?.[0]?.url ||
    null;

  const description = [
    item.name,
    item.currentBidAmount != null ? `Current Bid: $${item.currentBidAmount}` : null,
    item.retailPrice != null && item.retailPrice > 0 ? `Retail: $${item.retailPrice}` : null,
    item.condition ? `Condition: ${item.condition}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    url: olabidItemPermalinkUrl(item.id),
    title: `${item.name} - Olabid Auction`,
    description: description || null,
    imageUrl,
    siteName: 'Olabid',
  };
}
