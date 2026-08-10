import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { releaseSnap, rubberBand } from '../lib/panelMorph';
import { useChatShellMotion } from './useChatShellMotion';

const prefersReduced = vi.hoisted(() => ({ current: false }));

vi.mock('../lib/chatWasmBridge', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/chatWasmBridge')>();
  return {
    ...actual,
    prefersReducedMotion: () => prefersReduced.current,
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('useChatShellMotion math', () => {
  it('rubberBand damps past limit', () => {
    expect(rubberBand(50, 100)).toBe(50);
    expect(rubberBand(200, 100)).toBeLessThan(200);
  });

  it('releaseSnap returns discrete actions', () => {
    expect(['expand', 'compact', 'close', 'none']).toContain(releaseSnap(0, 0, false));
  });
});

describe('useChatShellMotion reduced motion', () => {
  afterEach(() => {
    prefersReduced.current = false;
  });

  it('short-circuits drag offset and release when reduced motion is on', () => {
    prefersReduced.current = true;
    let api: ReturnType<typeof useChatShellMotion> | null = null;

    function Probe() {
      api = useChatShellMotion(false);
      return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(Probe));
    });

    expect(api).not.toBeNull();
    expect(api!.onDrag(40)).toBe(0);
    expect(api!.dampOffset(200)).toBe(0);
    expect(api!.onRelease(1.5)).toBe('none');

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
