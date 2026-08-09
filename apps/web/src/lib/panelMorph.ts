/** Pure panel morph / rubber-band math. DOM application stays in React. */

export type RectLike = { x: number; y: number; width: number; height: number };

export type InvertFlipResult = {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
};

export type InvertFlipUniformResult = {
  dx: number;
  dy: number;
  scale: number;
};

export type ReleaseSnapAction = 'expand' | 'compact' | 'close' | 'none';

const DEFAULT_SNAP_THRESHOLD = 320;
const DEFAULT_FLICK_UP = 0.5;
const DEFAULT_FLICK_DOWN = 0.36;
const DEFAULT_FLICK_UP_STRONG = 1.1;
const DEFAULT_FLICK_DOWN_STRONG = 0.75;

/** Dampen an overscroll offset past `limit` (pixel rubber-band). */
export function rubberBand(offset: number, limit: number): number {
  if (limit <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const abs = Math.abs(offset);
  if (abs <= limit) return offset;
  const excess = abs - limit;
  const damped = limit + excess * (limit / (limit + excess));
  return sign * Math.min(damped, limit * 1.5);
}

/**
 * Decide snap action after a vertical drag on the chat shell handle.
 * Positive offsetY = dragged down.
 */
export function releaseSnap(
  offsetY: number,
  velocityY: number,
  expanded: boolean,
  threshold = DEFAULT_SNAP_THRESHOLD,
  flickUp = DEFAULT_FLICK_UP,
  flickDown = DEFAULT_FLICK_DOWN,
): ReleaseSnapAction {
  const strongUp = DEFAULT_FLICK_UP_STRONG;
  const strongDown = DEFAULT_FLICK_DOWN_STRONG;

  if (expanded) {
    if (velocityY < -strongUp || (offsetY < -threshold && velocityY <= flickUp)) {
      return 'none';
    }
    if (velocityY > strongDown || offsetY > threshold) {
      return 'compact';
    }
    if (velocityY > flickDown && offsetY > threshold * 0.35) {
      return 'compact';
    }
    return 'none';
  }

  // Compact mode
  if (velocityY < -strongUp || (offsetY < -threshold * 0.45 && velocityY <= flickUp)) {
    return 'expand';
  }
  if (velocityY > strongDown || offsetY > threshold * 0.55) {
    return 'close';
  }
  if (velocityY > flickDown && offsetY > threshold * 0.3) {
    return 'close';
  }
  return 'none';
}

/** Invert a FLIP layout change into a transform that starts at `from` and ends at identity on `to`. */
export function invertFlip(from: RectLike, to: RectLike): InvertFlipResult {
  const scaleX = to.width === 0 ? 1 : from.width / to.width;
  const scaleY = to.height === 0 ? 1 : from.height / to.height;
  const dx = from.x + from.width / 2 - (to.x + to.width / 2);
  const dy = from.y + from.height / 2 - (to.y + to.height / 2);
  return { dx, dy, scaleX, scaleY };
}

/** Uniform-scale invert (single scale factor = min of scaleX/scaleY). */
export function invertFlipUniform(from: RectLike, to: RectLike): InvertFlipUniformResult {
  const { dx, dy, scaleX, scaleY } = invertFlip(from, to);
  return { dx, dy, scale: Math.min(scaleX, scaleY) };
}

export function invertFlipCss(from: RectLike, to: RectLike): string {
  const { dx, dy, scaleX, scaleY } = invertFlip(from, to);
  return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
}

/** Map current layout rect toward a target with uniform scale (for shell morph frames). */
export function transformLayoutToTargetUniform(from: RectLike, to: RectLike): InvertFlipUniformResult {
  return invertFlipUniform(from, to);
}

/** Cubic ease-out used by scroll helpers; callers apply scrollTop per frame. */
export function easeScrollTo(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function measureRect(el: Element | null): RectLike | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
