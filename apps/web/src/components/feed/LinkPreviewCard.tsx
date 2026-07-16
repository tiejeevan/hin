import { Link2, Gavel, ExternalLink, X } from 'lucide-react';
import { LinkPreview } from '@hin/types';
import { getOlabidItemIdFromUrl } from '../../lib/appRoutes';

interface LinkPreviewCardProps {
  preview: LinkPreview;
  onClick?: (e: React.MouseEvent) => void;
  /** When false, Olabid links stay as external URLs (no in-app /olabid/:id navigation). */
  inAppOlabidLinks?: boolean;
  /** Compact horizontal card for chat (small thumb + limited text). */
  compact?: boolean;
  /** Optional dismiss control for draft previews in the composer. */
  onDismiss?: () => void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isOlabidLink(url: string): boolean {
  if (getOlabidItemIdFromUrl(url) !== null) return true;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('olabid.com');
  } catch {
    return false;
  }
}

function shortOlabidDescription(description?: string | null): string | null {
  if (!description) return null;
  // Prefer bid/retail snippet over the full "name • bid • retail • condition" string.
  const parts = description.split(' • ').map(p => p.trim()).filter(Boolean);
  const bid = parts.find(p => /^Current Bid:/i.test(p));
  const retail = parts.find(p => /^Retail:/i.test(p));
  const snippet = [bid, retail].filter(Boolean).join(' · ');
  return snippet || parts.slice(1, 3).join(' · ') || null;
}

export function LinkPreviewCard({
  preview,
  onClick,
  inAppOlabidLinks = true,
  compact = false,
  onDismiss,
}: LinkPreviewCardProps) {
  const itemId = getOlabidItemIdFromUrl(preview.url);
  const isOlabid = itemId !== null || isOlabidLink(preview.url);
  const href = itemId !== null && inAppOlabidLinks ? `/olabid/${itemId}` : preview.url;

  if (compact) {
    const detail = isOlabid
      ? shortOlabidDescription(preview.description)
      : preview.description?.split('\n')[0] || null;

    return (
      <div className="relative max-w-full">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className={`flex items-center gap-2 rounded-lg overflow-hidden border border-border-custom bg-bg-primary hover:border-indigo-500/50 transition-colors cursor-pointer group max-w-full ${onDismiss ? 'pr-7' : ''}`}
        >
          {preview.imageUrl ? (
            <div className="h-12 w-12 shrink-0 bg-bg-tertiary overflow-hidden relative">
              <img
                src={preview.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              {isOlabid && (
                <div className="absolute bottom-0.5 right-0.5 bg-amber-500/90 text-white p-0.5 rounded">
                  <Gavel className="h-2 w-2" />
                </div>
              )}
            </div>
          ) : (
            <div className="h-12 w-12 shrink-0 bg-bg-tertiary flex items-center justify-center">
              {isOlabid ? (
                <Gavel className="h-4 w-4 text-amber-500" />
              ) : (
                <Link2 className="h-4 w-4 text-text-muted" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1 py-1.5 pr-2">
            <div className="flex items-center gap-1 text-[9px] text-text-muted uppercase tracking-wide">
              {isOlabid ? (
                <span className="font-semibold text-amber-500">Olabid</span>
              ) : (
                <span className="truncate">{preview.siteName || getHostname(preview.url)}</span>
              )}
            </div>
            {preview.title && (
              <p className="text-[11px] font-semibold text-text-primary leading-snug line-clamp-1">
                {preview.title.replace(/\s*-\s*Olabid Auction$/i, '')}
              </p>
            )}
            {detail && (
              <p className="text-[10px] text-text-muted leading-snug line-clamp-1">{detail}</p>
            )}
          </div>
          {!onDismiss && (
            <ExternalLink className="h-3 w-3 text-text-muted shrink-0 mr-2 opacity-60 group-hover:text-indigo-400 transition-colors" />
          )}
        </a>
        {onDismiss && (
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onDismiss();
            }}
            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-bg-tertiary/90 border border-border-custom text-text-muted hover:text-text-primary flex items-center justify-center cursor-pointer"
            aria-label="Dismiss link preview"
            title="Dismiss preview"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="block rounded-xl overflow-hidden border border-border-custom bg-bg-primary hover:border-indigo-500/50 transition-colors cursor-pointer group"
    >
      {preview.imageUrl && (
        <div className={`w-full ${isOlabid ? 'aspect-square' : 'aspect-[2/1]'} bg-bg-tertiary overflow-hidden relative`}>
          <img
            src={preview.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {isOlabid && (
            <div className="absolute top-2 right-2 bg-amber-500/90 text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
              <Gavel className="h-3 w-3" />
              Auction
            </div>
          )}
        </div>
      )}
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted uppercase tracking-wide">
            {isOlabid ? (
              <>
                <Gavel className="h-3 w-3" />
                <span className="font-semibold text-amber-500">Olabid</span>
              </>
            ) : (
              <>
                <Link2 className="h-3 w-3" />
                {preview.siteName || getHostname(preview.url)}
              </>
            )}
          </div>
          <ExternalLink className="h-3 w-3 text-text-muted group-hover:text-indigo-400 transition-colors" />
        </div>
        {preview.title && (
          <p className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
            {preview.description}
          </p>
        )}
        {isOlabid && (
          <div className="pt-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md">
              <Gavel className="h-2.5 w-2.5" />
              View Auction Details
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
