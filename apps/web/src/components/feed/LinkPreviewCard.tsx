import { Link2 } from 'lucide-react';
import { LinkPreview } from '@hin/types';

interface LinkPreviewCardProps {
  preview: LinkPreview;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden border border-border-custom bg-bg-primary hover:border-indigo-500/50 transition-colors cursor-pointer"
    >
      {preview.imageUrl && (
        <div className="w-full aspect-[2/1] bg-bg-tertiary overflow-hidden">
          <img
            src={preview.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-text-muted uppercase tracking-wide">
          <Link2 className="h-3 w-3" />
          {preview.siteName || getHostname(preview.url)}
        </div>
        {preview.title && (
          <p className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-xs text-text-muted leading-relaxed line-clamp-2">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
