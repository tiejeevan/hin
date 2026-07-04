import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(
    Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0))
  );
  const [scale, setScale] = useState(1);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const dragY = useRef(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const goPrev = useCallback(() => {
    setIndex(i => (i > 0 ? i - 1 : i));
    setScale(1);
  }, []);

  const goNext = useCallback(() => {
    setIndex(i => (i < images.length - 1 ? i + 1 : i));
    setScale(1);
  }, [images.length]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, goPrev, goNext]);

  const touchDistance = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) => {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStart.current = { distance: touchDistance(e.touches[0], e.touches[1]), scale };
      touchStart.current = null;
      return;
    }
    if (e.touches.length === 1) {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
      dragY.current = 0;
      setIsDragging(true);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const next = Math.min(4, Math.max(1, (pinchStart.current.scale * dist) / pinchStart.current.distance));
      setScale(next);
      return;
    }
    if (!touchStart.current || scale > 1) return;
    const dy = e.touches[0].clientY - touchStart.current.y;
    dragY.current = dy;
    if (Math.abs(dy) > 8) setOffsetY(dy);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (pinchStart.current) {
      pinchStart.current = null;
      if (scale < 1.05) setScale(1);
      setIsDragging(false);
      return;
    }

    const start = touchStart.current;
    touchStart.current = null;
    setIsDragging(false);

    if (!start) return;

    const endX = e.changedTouches[0]?.clientX ?? start.x;
    const endY = e.changedTouches[0]?.clientY ?? start.y;
    const dx = endX - start.x;
    const dy = endY - start.y;
    const elapsed = Date.now() - start.time;

    if (scale <= 1 && dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }

    setOffsetY(0);

    if (scale > 1) return;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && elapsed < 600) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  if (images.length === 0) return null;

  const backdropOpacity = Math.max(0.4, 1 - Math.abs(offsetY) / 300);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-[100] flex items-center justify-center touch-none"
      style={{ backgroundColor: `rgba(0,0,0,${0.92 * backdropOpacity})` }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-3 right-3 z-20 h-11 w-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>

      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-white/80 text-sm font-medium tabular-nums bg-black/40 px-3 py-1 rounded-full">
          {index + 1} / {images.length}
        </div>
      )}

      {images.length > 1 && index > 0 && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 z-20 h-12 w-12 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      {images.length > 1 && index < images.length - 1 && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-2 z-20 h-12 w-12 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer"
          aria-label="Next image"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      <div
        className="relative max-w-full max-h-full w-full h-full flex items-center justify-center px-2"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={images[index]}
          alt={`Image ${index + 1} of ${images.length}`}
          draggable={false}
          className="max-w-full max-h-[100dvh] object-contain select-none"
          style={{
            transform: `translateY(${offsetY}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          onDoubleClick={() => setScale(s => (s > 1 ? 1 : 2))}
        />
      </div>
    </div>
  );
}
