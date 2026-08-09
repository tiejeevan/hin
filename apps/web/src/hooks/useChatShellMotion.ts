import { useCallback, useRef } from 'react';
import {
  prefersReducedMotion,
  releaseSnap,
  rubberBand,
  type ReleaseSnapAction,
} from '../lib/chatWasmBridge';

/**
 * Shell drag math via WASM bridge (TS fallback). DOM apply stays in caller.
 */
export function useChatShellMotion(expanded: boolean) {
  const offsetYRef = useRef(0);

  const dampOffset = useCallback((raw: number, limit = 320) => {
    if (prefersReducedMotion()) return Math.max(-limit * 0.2, Math.min(limit * 0.2, raw));
    return rubberBand(raw, limit);
  }, []);

  const onDrag = useCallback(
    (deltaY: number) => {
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
