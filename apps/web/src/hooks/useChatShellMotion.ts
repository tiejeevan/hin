import { useCallback, useRef } from 'react';
import {
  prefersReducedMotion,
  releaseSnap,
  rubberBand,
  type ReleaseSnapAction,
} from '../lib/chatWasmBridge';

/**
 * Shell drag math via WASM bridge (TS fallback). DOM apply stays in caller.
 * When prefers-reduced-motion is on, drag offset and snap animations short-circuit
 * (no rubber-band transform, release always `'none'`).
 */
export function useChatShellMotion(expanded: boolean) {
  const offsetYRef = useRef(0);

  const dampOffset = useCallback((raw: number, limit = 320) => {
    // Instant / zero visual pull — caller can still track intent if needed via offsetYRef.
    if (prefersReducedMotion()) return 0;
    return rubberBand(raw, limit);
  }, []);

  const onDrag = useCallback(
    (deltaY: number) => {
      if (prefersReducedMotion()) {
        offsetYRef.current = 0;
        return 0;
      }
      offsetYRef.current += deltaY;
      return dampOffset(offsetYRef.current);
    },
    [dampOffset],
  );

  const onRelease = useCallback(
    (velocityY: number): ReleaseSnapAction => {
      if (prefersReducedMotion()) {
        offsetYRef.current = 0;
        return 'none';
      }
      const action = releaseSnap(offsetYRef.current, velocityY, expanded);
      offsetYRef.current = 0;
      return action;
    },
    [expanded],
  );

  const reset = useCallback(() => {
    offsetYRef.current = 0;
  }, []);

  return { offsetYRef, onDrag, onRelease, reset, dampOffset };
}
