import { useCallback, useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/panelMorph';
import { rubberBand } from '../lib/chatWasmBridge';

export type OverscrollBounceRef<T extends HTMLElement> = ((node: T | null) => void) & {
  current: T | null;
};

/**
 * Gives a scrollable element a rubber-band "bump" when the user scrolls past
 * the start or end (or when the content isn't tall enough to scroll at all),
 * and keeps the scroll from chaining to the page behind it.
 *
 * Works for both desktop (wheel) and touch devices (touch drag).
 *
 * Bindings attach/detach via a callback ref whenever the scroll node mounts or
 * unmounts (e.g. thread list ↔ conversation), and rebind when `enabled` flips.
 *
 * The returned ref is both a callback ref and a `{ current }` object so callers
 * can use `ref={scrollRef}` and `scrollRef.current` interchangeably.
 * Its parent should clip overflow (e.g. `overflow-hidden`) so the bump is contained.
 */
export function useOverscrollBounce<T extends HTMLElement>(
  enabled = true,
): OverscrollBounceRef<T> {
  const elementRef = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const resetTimer = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const attachRef = useRef<(el: T) => void>(() => {});
  const detachRef = useRef<() => void>(() => {});

  detachRef.current = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  };

  attachRef.current = (el: T) => {
    detachRef.current();
    if (!enabledRef.current || prefersReducedMotion()) return;

    const settle = (duration = 0.38) => {
      el.style.transition = `transform ${duration}s cubic-bezier(0.22, 1.2, 0.36, 1)`;
      el.style.transform = 'translateY(0)';
    };

    const boundaries = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const nonScrollable = scrollHeight <= clientHeight + 1;
      return {
        nonScrollable,
        atTop: scrollTop <= 0,
        atBottom: scrollTop + clientHeight >= scrollHeight - 1,
      };
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const { nonScrollable, atTop, atBottom } = boundaries();
      const hitStart = e.deltaY < 0 && (atTop || nonScrollable);
      const hitEnd = e.deltaY > 0 && (atBottom || nonScrollable);
      if (!hitStart && !hitEnd) return;

      e.preventDefault();
      const dir = hitStart ? 1 : -1;
      const magnitude = Math.min(18, 5 + Math.abs(e.deltaY) * 0.22);
      el.style.transition = 'transform 0.08s ease-out';
      el.style.transform = `translateY(${dir * magnitude}px)`;

      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => settle(), 90);
    };

    let lastY = 0;
    let overscroll = 0;
    let pulling = false;
    let pullDir = 0;

    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0].clientY;
      overscroll = 0;
      pulling = false;
      pullDir = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const dy = y - lastY;
      lastY = y;
      if (dy === 0) return;

      if (!pulling) {
        const { nonScrollable, atTop, atBottom } = boundaries();
        const hitStart = dy > 0 && (atTop || nonScrollable);
        const hitEnd = dy < 0 && (atBottom || nonScrollable);
        if (!hitStart && !hitEnd) return;
        pulling = true;
        pullDir = hitStart ? 1 : -1;
        overscroll = 0;
        el.style.transition = 'none';
      }

      overscroll += dy;
      if ((pullDir === 1 && overscroll <= 0) || (pullDir === -1 && overscroll >= 0)) {
        pulling = false;
        el.style.transform = 'translateY(0)';
        return;
      }

      e.preventDefault();
      const damped = rubberBand(overscroll * 0.55, 120);
      el.style.transform = `translateY(${damped}px)`;
    };

    const onTouchEnd = () => {
      if (pulling || el.style.transform) settle();
      pulling = false;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    cleanupRef.current = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
      el.style.transform = '';
      el.style.transition = '';
    };
  };

  const setRef = useCallback((node: T | null) => {
    if (elementRef.current === node) return;
    detachRef.current();
    elementRef.current = node;
    if (node) attachRef.current(node);
  }, []);

  // Rebind when `enabled` flips while a node is already mounted.
  useEffect(() => {
    const el = elementRef.current;
    detachRef.current();
    if (el && enabled) attachRef.current(el);
  }, [enabled]);

  // Stable hybrid: callback ref + `.current` for scroll helpers.
  const hybridRef = useRef<OverscrollBounceRef<T> | null>(null);
  if (hybridRef.current === null) {
    const fn = ((node: T | null) => {
      setRef(node);
    }) as OverscrollBounceRef<T>;
    Object.defineProperty(fn, 'current', {
      enumerable: true,
      configurable: true,
      get: () => elementRef.current,
      set: (value: T | null) => {
        setRef(value);
      },
    });
    hybridRef.current = fn;
  }

  return hybridRef.current;
}
