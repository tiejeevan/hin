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
  Archive,
  Bookmark,
} from 'lucide-react';
import { ChatThread, ItemComment, LinkPreview, User as UserType } from '@hin/types';
import { ChatRecipient, ItemCommentNode } from '../types/ui';
import { API_URL } from '../config';
import { olabidItemPermalinkUrl } from '../lib/appRoutes';
import { buildOlabidLinkPreview } from '../lib/olabidPreview';
import { ItemDiscussionSection } from '../components/olabid/ItemDiscussionSection';
import { ShareToChatModal } from '../components/olabid/ShareToChatModal';
import { ItemActionsMenu } from '../components/olabid/ItemActionsMenu';

interface OlabidItemDetails {
  id: number;
  sku?: string;
  name: string;
  currentBidderId?: number;
  currentBidAmount?: number;
  nextBidAmount?: number;
  numberOfBids?: number;
  retailPrice?: number;
  auctionEndsAt?: string;
  auctionFinishesInMs?: number;
  condition?: string;
  conditionNote?: string;
  status?: string;
  images?: Array<{
    url: string;
    smallUrl: string;
    mediumUrl: string;
    largeUrl: string;
    xLargeUrl: string;
    mediaType: string;
  }>;
  shippingIsUnavailable?: boolean;
  shippingIsFree?: boolean;
  pickupIsUnavailable?: boolean;
  inWatchlist?: boolean;
  isPaid?: boolean;
  isWithoutFees?: boolean;
  amazonLink?: string;
  /** Present when serving a locally cached snapshot after the live auction disappears. */
  source?: 'live' | 'snapshot';
  imageUrl?: string | null;
  lastSyncedAt?: string;
  /** Hin-side watchlist bookmark for the current user. */
  hasBookmarked?: boolean;
}

interface OlabidItemPageProps {
  itemId: number;
  onBack: () => void;
  currentUser: UserType | null;
  gamificationEnabled?: boolean;
  threads: ChatThread[];
  token: string | null;
  comments: ItemComment[];
  newCommentText: string;
  replyingTo: ItemComment | null;
  editingCommentId: number | null;
  editingCommentContent: string;
  onFetchComments: (itemId: number) => void;
  onCommentTextChange: (text: string) => void;
  onCreateComment: (e: React.FormEvent) => void;
  onCancelReply: () => void;
  onReply: (olabidItemId: number, comment: ItemCommentNode) => void;
  onDeleteComment: (olabidItemId: number, commentId: number) => void;
  onStartEdit: (commentId: number, content: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (olabidItemId: number, commentId: number) => void;
  onEditContentChange: (content: string) => void;
  onToggleCommentLike: (olabidItemId: number, commentId: number) => void;
  onViewProfile: (userIdOrUsername: number | string) => void;
  onViewHashtag?: (tag: string) => void;
  onSignInRequired?: () => void;
  onShareToChat: (recipient: ChatRecipient, prefillText: string, seedPreview?: LinkPreview | null) => void;
  onPostItem: (permalink: string, seedPreview: LinkPreview) => void;
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

export function OlabidItemPage({
  itemId,
  onBack,
  currentUser,
  gamificationEnabled = false,
  threads,
  token,
  comments,
  newCommentText,
  replyingTo,
  editingCommentId,
  editingCommentContent,
  onFetchComments,
  onCommentTextChange,
  onCreateComment,
  onCancelReply,
  onReply,
  onDeleteComment,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditContentChange,
  onToggleCommentLike,
  onViewProfile,
  onViewHashtag,
  onSignInRequired,
  onShareToChat,
  onPostItem,
}: OlabidItemPageProps) {
  const [item, setItem] = useState<OlabidItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [hasBookmarked, setHasBookmarked] = useState(false);

  const fetchItem = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/olabid/items/${itemId}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.status === 404) {
        throw new Error('Item not found');
      }
      if (!response.ok) {
        throw new Error('Failed to load item details');
      }
      const data: OlabidItemDetails = await response.json();
      setItem(data);
      setHasBookmarked(!!data.hasBookmarked);
      setRemainingMs(data.auctionFinishesInMs ?? 0);
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
    onFetchComments(itemId);
  }, [itemId]);

  useEffect(() => {
    if (!item || item.source === 'snapshot' || remainingMs <= 0) return;
    const timer = setInterval(() => {
      setRemainingMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [item?.id, item?.source, remainingMs > 0]);

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

  const requireAuth = (action: () => void) => {
    if (!currentUser) {
      onSignInRequired?.();
      return;
    }
    action();
  };

  const toggleBookmark = async () => {
    if (!currentUser || !token) {
      onSignInRequired?.();
      return;
    }
    const prev = hasBookmarked;
    setHasBookmarked(!prev);
    try {
      const res = await fetch(`${API_URL}/api/olabid/items/${itemId}/bookmark`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHasBookmarked(!!data.bookmarked);
      } else {
        setHasBookmarked(prev);
      }
    } catch {
      setHasBookmarked(prev);
    }
  };

  const handlePostIt = () => {
    requireAuth(() => {
      if (!item) return;
      const preview = buildOlabidLinkPreview(item);
      onPostItem(olabidItemPermalinkUrl(itemId), preview);
    });
  };

  const isSnapshot = item?.source === 'snapshot';
  const currentBid = item?.currentBidAmount ?? 0;
  const retailPrice = item?.retailPrice ?? 0;
  const savings =
    item && retailPrice > 0
      ? Math.round(((retailPrice - currentBid) / retailPrice) * 100)
      : 0;

  const images = item?.images ?? [];
  const currentImage = images[imageIndex];
  const fallbackImage = item?.imageUrl;

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
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={toggleBookmark}
              className={`p-2.5 rounded-xl transition-colors ${
                hasBookmarked
                  ? 'text-amber-500 hover:bg-amber-500/10'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              }`}
              title={hasBookmarked ? 'Remove from watchlist' : 'Add to watchlist'}
              aria-label={hasBookmarked ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              <Bookmark className={`h-5 w-5 ${hasBookmarked ? 'fill-current' : ''}`} />
            </button>
            <ItemActionsMenu
              onSendToChat={() => requireAuth(() => setShowShareModal(true))}
              onPostIt={handlePostIt}
            />
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">
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
          <>
            {isSnapshot && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm">
                <Archive className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    This auction has ended — showing saved details
                  </p>
                  <p className="text-text-secondary text-xs mt-0.5">
                    Discussion is still available. Live bid data may be outdated
                    {item.lastSyncedAt
                      ? ` (last synced ${new Date(item.lastSyncedAt).toLocaleDateString()})`
                      : ''}
                    .
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Gallery */}
              <div className="space-y-3">
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-bg-tertiary border border-border">
                  {currentImage || fallbackImage ? (
                    <img
                      src={currentImage ? (currentImage.largeUrl || currentImage.url) : fallbackImage!}
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
                    {item.sku && <span>SKU {item.sku}</span>}
                    {item.sku && item.status && <span>·</span>}
                    {item.status && <span>{item.status}</span>}
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-text-primary leading-tight">
                    {item.name}
                  </h1>
                </div>

                <div className="rounded-2xl border border-border bg-bg-secondary p-5 space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm text-text-secondary mb-1">
                        {isSnapshot ? 'Last known bid' : 'Current bid'}
                      </p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
                        ${currentBid}
                      </p>
                      {retailPrice > 0 && (
                        <p className="text-sm text-text-tertiary mt-1">
                          Retail <span className="line-through">${retailPrice}</span>
                        </p>
                      )}
                    </div>
                    {!isSnapshot && item.nextBidAmount != null && (
                      <div className="text-right">
                        <p className="text-sm text-text-secondary mb-1">Next bid</p>
                        <p className="text-2xl font-semibold text-text-primary">${item.nextBidAmount}</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {item.numberOfBids ?? 0} bid{(item.numberOfBids ?? 0) === 1 ? '' : 's'}
                        </p>
                      </div>
                    )}
                  </div>

                  {!isSnapshot && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-tertiary">
                      <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-text-primary">
                        {remainingMs > 0 ? `Ends in ${formatTimeRemaining(remainingMs)}` : 'Auction ended'}
                      </span>
                    </div>
                  )}

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

                {item.condition && (
                  <div className="rounded-2xl border border-border bg-bg-secondary p-5 space-y-2">
                    <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                      Condition
                    </h2>
                    <p className="text-text-primary font-medium">{item.condition}</p>
                    {item.conditionNote && (
                      <p className="text-sm text-text-secondary leading-relaxed">{item.conditionNote}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={openOnOlabid}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 shadow-lg transition-all"
                  >
                    <ExternalLink className="h-5 w-5" />
                    {isSnapshot ? 'View on Olabid' : 'Bid on Olabid'}
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

            <ItemDiscussionSection
              olabidItemId={itemId}
              comments={comments}
              currentUser={currentUser}
              gamificationEnabled={gamificationEnabled}
              newCommentText={newCommentText}
              replyingTo={replyingTo}
              editingCommentId={editingCommentId}
              editingCommentContent={editingCommentContent}
              onCommentTextChange={onCommentTextChange}
              onCreateComment={onCreateComment}
              onCancelReply={onCancelReply}
              onReply={onReply}
              onDeleteComment={onDeleteComment}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onEditContentChange={onEditContentChange}
              onToggleCommentLike={onToggleCommentLike}
              onViewProfile={onViewProfile}
              onViewHashtag={onViewHashtag}
              onSignInRequired={onSignInRequired}
            />
          </>
        ) : null}
      </div>

      {showShareModal && item && (
        <ShareToChatModal
          itemId={itemId}
          itemName={item.name}
          threads={threads}
          token={token}
          permalinkUrl={olabidItemPermalinkUrl(itemId)}
          onClose={() => setShowShareModal(false)}
          onSelect={(recipient, prefillText) => {
            setShowShareModal(false);
            onShareToChat(recipient, prefillText, buildOlabidLinkPreview(item));
          }}
        />
      )}
    </div>
  );
}
