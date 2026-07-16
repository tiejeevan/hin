import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Clock,
  Gavel,
  Package,
  Truck,
  Award,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import { API_URL } from '../config';
import { olabidItemPermalinkUrl } from '../lib/appRoutes';

interface OlabidItemDetails {
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
  shippingIsFree?: boolean;
  pickupIsUnavailable?: boolean;
  inWatchlist: boolean;
  isPaid: boolean;
  isWithoutFees?: boolean;
  amazonLink?: string;
}

interface OlabidItemPageProps {
  itemId: number;
  onBack: () => void;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Ended';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function OlabidItemPage({ itemId, onBack }: OlabidItemPageProps) {
  const [item, setItem] = useState<OlabidItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const fetchItem = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/olabid/items/${itemId}`, {
        cache: 'no-store',
      });
      if (response.status === 404) {
        throw new Error('Item not found');
      }
      if (!response.ok) {
        throw new Error('Failed to load item details');
      }
      const data: OlabidItemDetails = await response.json();
      setItem(data);
      setRemainingMs(data.auctionFinishesInMs);
      setImageIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItem();
  }, [itemId]);

  useEffect(() => {
    if (!item || remainingMs <= 0) return;
    const timer = setInterval(() => {
      setRemainingMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [item?.id, remainingMs > 0]);

  const copyPermalink = async () => {
    try {
      await navigator.clipboard.writeText(olabidItemPermalinkUrl(itemId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const openOnOlabid = () => {
    window.open(`https://link.olabid.com/item-details?id=${itemId}`, '_blank');
  };

  const savings =
    item && item.retailPrice > 0
      ? Math.round(((item.retailPrice - item.currentBidAmount) / item.retailPrice) * 100)
      : 0;

  const images = item?.images ?? [];
  const currentImage = images[imageIndex];

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="sticky top-0 z-10 bg-bg-secondary/95 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-bg-tertiary text-text-primary transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-medium">Back to auctions</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyPermalink}
              className="p-2.5 rounded-xl hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
              title="Copy permalink"
            >
              {copied ? <Check className="h-5 w-5 text-emerald-500" /> : <Copy className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={fetchItem}
              disabled={loading}
              className="p-2.5 rounded-xl hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {loading && !item ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
            <div className="aspect-square rounded-2xl bg-bg-tertiary" />
            <div className="space-y-4">
              <div className="h-8 bg-bg-tertiary rounded w-3/4" />
              <div className="h-4 bg-bg-tertiary rounded w-1/2" />
              <div className="h-24 bg-bg-tertiary rounded" />
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 mx-auto mb-3 text-text-tertiary opacity-40" />
            <p className="font-medium text-text-primary">{error}</p>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 px-4 py-2 rounded-xl bg-bg-secondary border border-border text-text-primary hover:bg-bg-tertiary"
            >
              Back to auctions
            </button>
          </div>
        ) : item ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Gallery */}
            <div className="space-y-3">
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-bg-tertiary border border-border">
                {currentImage ? (
                  <img
                    src={currentImage.largeUrl || currentImage.url}
                    alt={item.name}
                    className="w-full h-full object-contain bg-white"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-20 w-20 text-text-tertiary opacity-40" />
                  </div>
                )}

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}

                <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2">
                  {savings >= 50 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow">
                      <TrendingUp className="h-3 w-3" />
                      {savings}% OFF
                    </span>
                  )}
                  {item.isWithoutFees && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-purple-500 to-pink-600 shadow">
                      <Award className="h-3 w-3" />
                      NO FEES
                    </span>
                  )}
                </div>
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, idx) => (
                    <button
                      key={`${img.mediumUrl}-${idx}`}
                      type="button"
                      onClick={() => setImageIndex(idx)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                        idx === imageIndex ? 'border-amber-500' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img.smallUrl || img.mediumUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
                  <Gavel className="h-3.5 w-3.5 text-amber-500" />
                  <span>SKU {item.sku}</span>
                  <span>·</span>
                  <span>{item.status}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary leading-tight">
                  {item.name}
                </h1>
              </div>

              <div className="rounded-2xl border border-border bg-bg-secondary p-5 space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-text-secondary mb-1">Current bid</p>
                    <p className="text-4xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                      ${item.currentBidAmount}
                    </p>
                    {item.retailPrice > 0 && (
                      <p className="text-sm text-text-tertiary mt-1">
                        Retail <span className="line-through">${item.retailPrice}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-text-secondary mb-1">Next bid</p>
                    <p className="text-2xl font-semibold text-text-primary">${item.nextBidAmount}</p>
                    <p className="text-xs text-text-tertiary mt-1">
                      {item.numberOfBids} bid{item.numberOfBids === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-tertiary">
                  <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-text-primary">
                    {remainingMs > 0 ? `Ends in ${formatTimeRemaining(remainingMs)}` : 'Auction ended'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.shippingIsFree && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/15 text-emerald-600">
                      <Truck className="h-3.5 w-3.5" />
                      Free shipping
                    </span>
                  )}
                  {item.shippingIsUnavailable && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-bg-tertiary text-text-secondary">
                      <Truck className="h-3.5 w-3.5" />
                      Pickup only
                    </span>
                  )}
                  {item.pickupIsUnavailable && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-bg-tertiary text-text-secondary">
                      Shipping only
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-bg-secondary p-5 space-y-2">
                <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                  Condition
                </h2>
                <p className="text-text-primary font-medium">{item.condition}</p>
                {item.conditionNote && (
                  <p className="text-sm text-text-secondary leading-relaxed">{item.conditionNote}</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={openOnOlabid}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 shadow-lg transition-all"
                >
                  <ExternalLink className="h-5 w-5" />
                  Bid on Olabid
                </button>
                {item.amazonLink && (
                  <a
                    href={item.amazonLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold border border-border bg-bg-secondary text-text-primary hover:bg-bg-tertiary transition-colors"
                  >
                    <ShoppingBag className="h-5 w-5" />
                    Compare on Amazon
                  </a>
                )}
              </div>

              <p className="text-xs text-text-tertiary">
                Permalink: <span className="font-mono text-text-secondary">/olabid/{item.id}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
