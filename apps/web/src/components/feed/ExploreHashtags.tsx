import { useEffect, useState } from 'react';
import { Hash, Loader2 } from 'lucide-react';
import { TrendingHashtag } from '@hin/types';
import { API_URL } from '../../config';

interface ExploreHashtagsProps {
  activeHashtag: string | null;
  onSelectHashtag: (tag: string) => void;
}

export function ExploreHashtags({ activeHashtag, onSelectHashtag }: ExploreHashtagsProps) {
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`${API_URL}/api/hashtags/trending?window=7d&limit=15`)
      .then(res => (res.ok ? res.json() : { hashtags: [] }))
      .then(data => {
        if (cancelled) return;
        setHashtags(data.hashtags ?? []);
        if (!activeHashtag && data.hashtags?.length > 0) {
          onSelectHashtag(data.hashtags[0].tag);
        }
      })
      .catch(() => {
        if (!cancelled) setHashtags([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Only load trending hashtags once per mount; auto-select handled via activeHashtag check above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-text-muted text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading trending hashtags…
      </div>
    );
  }

  if (hashtags.length === 0) {
    return (
      <div className="text-center py-6 border border-dashed border-border-custom rounded-2xl text-text-muted text-xs">
        No trending hashtags yet. Be the first to post with a #hashtag!
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {hashtags.map(({ tag, count }) => {
        const selected = activeHashtag === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onSelectHashtag(tag)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer min-h-[36px] ${
              selected
                ? 'bg-indigo-600 text-white'
                : 'bg-bg-secondary border border-border-custom text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
            }`}
          >
            <Hash className="h-3 w-3" />
            {tag}
            <span className={selected ? 'text-indigo-200' : 'text-text-muted'}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
