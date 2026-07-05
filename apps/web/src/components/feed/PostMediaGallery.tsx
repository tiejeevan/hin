interface PostMediaGalleryProps {
  urls: string[];
  onImageClick?: (index: number) => void;
}

function getMediaItemClass(count: number, index: number): string {
  if (count === 1) {
    return 'w-full aspect-[4/3] sm:aspect-[3/2] max-h-72 sm:max-h-96';
  }
  if (count === 3 && index === 0) {
    return 'col-span-2 aspect-[2/1]';
  }
  return 'aspect-square';
}

export function PostMediaGallery({ urls, onImageClick }: PostMediaGalleryProps) {
  if (urls.length === 0) return null;

  const isSingle = urls.length === 1;

  return (
    <div
      className={`rounded-xl overflow-hidden border border-border-custom bg-bg-primary ${
        isSingle ? '' : 'grid gap-0.5 grid-cols-2'
      }`}
    >
      {urls.map((url, i) => {
        const itemClass = getMediaItemClass(urls.length, i);
        const content = (
          <img
            src={url}
            alt={`Post attachment ${i + 1}`}
            className="w-full h-full object-cover"
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        );

        if (onImageClick) {
          return (
            <button
              type="button"
              key={url + i}
              onClick={() => onImageClick(i)}
              className={`block p-0 border-0 bg-transparent cursor-pointer overflow-hidden ${itemClass}`}
              aria-label={`View image ${i + 1}`}
            >
              {content}
            </button>
          );
        }

        return (
          <div key={url + i} className={`overflow-hidden ${itemClass}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export { getMediaItemClass };
