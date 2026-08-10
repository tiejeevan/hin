import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  invertFlipCss,
  measureRect,
  prefersReducedMotion,
  type RectLike,
} from '../lib/panelMorph';

/** Short FLIP play duration for panel expand / collapse. */
export const PANEL_EXPAND_FLIP_MS = 280;

/**
 * Runs a FLIP morph when `isExpanded` changes.
 * Skips transforms entirely when `prefers-reduced-motion: reduce` is set.
 *
 * Wire in MessagesPanel (or ChatBox shell):
 * ```tsx
 * const panelShellRef = useRef<HTMLDivElement>(null);
 * usePanelExpandFlip(isExpanded, panelShellRef);
 * // attach ref to outer panel div
 * ```
 */
export function usePanelExpandFlip(
  isExpanded: boolean,
  panelRef: RefObject<HTMLElement | null>,
  durationMs = PANEL_EXPAND_FLIP_MS,
): void {
  const prevExpandedRef = useRef(isExpanded);
  const firstRectRef = useRef<RectLike | null>(null);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const expandedChanged = prevExpandedRef.current !== isExpanded;
    prevExpandedRef.current = isExpanded;

    if (!expandedChanged) {
      firstRectRef.current = measureRect(el);
      return;
    }

    // Instant class change — no invert / play.
    if (prefersReducedMotion()) {
      el.style.transition = '';
      el.style.transform = '';
      firstRectRef.current = measureRect(el);
      return;
    }

    const first = firstRectRef.current;
    const last = measureRect(el);
    if (!first || !last) {
      firstRectRef.current = last;
      return;
    }

    const invert = invertFlipCss(first, last);
    // Suppress open-pop CSS animation so it doesn't fight the FLIP transform.
    const prevAnimation = el.style.animation;
    el.style.animation = 'none';
    el.style.transition = 'none';
    el.style.transformOrigin = '50% 50%';
    el.style.transform = invert;
    // Force invert to paint before play.
    void el.getBoundingClientRect();

    let finished = false;
    let innerRaf = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.style.transition = '';
      el.style.transform = '';
      el.style.animation = prevAnimation;
      el.removeEventListener('transitionend', onEnd);
    };

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'transform') return;
      finish();
    };

    el.addEventListener('transitionend', onEnd);

    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        if (finished) return;
        el.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = 'none';
      });
    });

    const safety = window.setTimeout(finish, durationMs + 100);
    firstRectRef.current = last;

    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(safety);
      finish();
    };
  }, [durationMs, isExpanded, panelRef]);
}
