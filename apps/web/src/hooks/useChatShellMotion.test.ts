import { describe, it, expect } from 'vitest';
import { releaseSnap, rubberBand } from '../lib/panelMorph';

describe('useChatShellMotion math', () => {
  it('rubberBand damps past limit', () => {
    expect(rubberBand(50, 100)).toBe(50);
    expect(rubberBand(200, 100)).toBeLessThan(200);
  });

  it('releaseSnap returns discrete actions', () => {
    expect(['expand', 'compact', 'close', 'none']).toContain(releaseSnap(0, 0, false));
  });
});
