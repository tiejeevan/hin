import { describe, it, expect } from 'vitest';
import { easeScrollTo, invertFlipUniform, releaseSnap, rubberBand } from './panelMorph';

describe('rubberBand', () => {
  it('passthrough within limit', () => {
    expect(rubberBand(10, 100)).toBe(10);
    expect(rubberBand(-20, 100)).toBe(-20);
  });

  it('damps beyond limit', () => {
    const out = rubberBand(200, 100);
    expect(out).toBeGreaterThan(100);
    expect(out).toBeLessThan(200);
  });
});

describe('releaseSnap', () => {
  it('expands on strong upward flick when compact', () => {
    expect(releaseSnap(-10, -1.2, false)).toBe('expand');
  });

  it('closes on downward drag when compact', () => {
    expect(releaseSnap(200, 0.5, false)).toBe('close');
  });

  it('compacts when expanded and dragged down', () => {
    expect(releaseSnap(400, 0.2, true)).toBe('compact');
  });
});

describe('invertFlipUniform', () => {
  it('returns finite scale', () => {
    const r = invertFlipUniform(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 10, y: 20, width: 200, height: 50 },
    );
    expect(Number.isFinite(r.scale)).toBe(true);
    expect(r.dx).not.toBe(0);
  });
});

describe('easeScrollTo', () => {
  it('eases cubic out', () => {
    expect(easeScrollTo(0)).toBe(0);
    expect(easeScrollTo(1)).toBe(1);
    expect(easeScrollTo(0.5)).toBeGreaterThan(0.5);
  });
});
