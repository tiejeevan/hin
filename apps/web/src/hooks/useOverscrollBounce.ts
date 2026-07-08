import { useEffect, useRef } from 'react';

/**
 * Gives a scrollable element a rubber-band "bump" when the user scrolls past
 * the start or end (or when the content isn't tall enough to scroll at all),
 * and keeps the scroll from chaining to the page behind it.
 *
 * Works for both desktop (wheel) and touch devices (touch drag).
 *
 * The returned ref must be attached to the element that has `overflow-y: auto`.
 * Its parent should clip overflow (e.g. `overflow-hidden`) so the bump is contained.
 */
export function useOverscrollBounce<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const settle = (duration = 0.32) => {
      el.style.transition = `transform ${duration}s cubic-bezier(0.22, 1, 0.36, 1)`;
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

    // --- Desktop: wheel ---
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const { nonScrollable, atTop, atBottom } = boundaries();
      const hitStart = e.deltaY < 0 && (atTop || nonScrollable);
      const hitEnd = e.deltaY > 0 && (atBottom || nonScrollable);
      if (!hitStart && !hitEnd) return;

      e.preventDefault();
      const dir = hitStart ? 1 : -1;
      const magnitude = Math.min(12, 4 + Math.abs(e.deltaY) * 0.18);
      el.style.transition = 'transform 0.08s ease-out';
      el.style.transform = `translateY(${dir * magnitude}px)`;

      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => settle(), 90);
    };

    // --- Touch: drag ---
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
        if (!hitStart && !hitEnd) return; // let the list scroll natively
        pulling = true;
        pullDir = hitStart ? 1 : -1;
        overscroll = 0;
        el.style.transition = 'none';
      }

      overscroll += dy;
      // Released back toward neutral: hand control back to native scrolling.
      if ((pullDir === 1 && overscroll <= 0) || (pullDir === -1 && overscroll >= 0)) {
        pulling = false;
        el.style.transform = 'translateY(0)';
        return;
      }

      e.preventDefault();
      const damped = Math.sign(overscroll) * Math.min(90, Math.abs(overscroll) * 0.4);
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

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      el.style.transform = '';
      el.style.transition = '';
    };
  }, [enabled]);

  return ref;
}
