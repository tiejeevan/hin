import { BrandMark } from './BrandMark';

interface HeaderBrandClusterProps {
  onGoHome: () => void;
  homeAriaLabel?: string;
  onlineCount?: number;
}

export function HeaderBrandCluster({
  onGoHome,
  homeAriaLabel = 'Go home',
  onlineCount,
}: HeaderBrandClusterProps) {
  return (
    <div className="flex items-center gap-3 min-w-0 h-full">
      <button
        type="button"
        onClick={onGoHome}
        className="flex items-center shrink-0 rounded-lg hover:opacity-90 transition-opacity cursor-pointer -ml-1 px-1"
        aria-label={homeAriaLabel}
      >
        <BrandMark size="sm" />
      </button>
      {typeof onlineCount === 'number' && onlineCount > 0 && (
        <span
          className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-border-custom/80 bg-bg-primary/60 px-2.5 py-1 text-[11px] font-medium text-text-muted tabular-nums leading-none"
          title={`${onlineCount} ${onlineCount === 1 ? 'person' : 'people'} online`}
          aria-label={`${onlineCount} ${onlineCount === 1 ? 'person' : 'people'} online`}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {onlineCount}
        </span>
      )}
    </div>
  );
}
