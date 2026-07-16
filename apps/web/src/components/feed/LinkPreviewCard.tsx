import { Link2, Gavel, ExternalLink } from 'lucide-react';
import { LinkPreview } from '@hin/types';
import { getOlabidItemIdFromUrl } from '../../lib/appRoutes';

interface LinkPreviewCardProps {
  preview: LinkPreview;
  onClick?: (e: React.MouseEvent) => void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isOlabidLink(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('olabid.com');
  } catch {
    return false;
  }
}

export function LinkPreviewCard({ preview, onClick }: LinkPreviewCardProps) {
  const isOlabid = isOlabidLink(preview.url);
  const itemId = isOlabid ? getOlabidItemIdFromUrl(preview.url) : null;
  const href = itemId !== null ? `/olabid/${itemId}` : preview.url;
  
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
