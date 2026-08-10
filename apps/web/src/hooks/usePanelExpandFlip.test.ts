import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  PANEL_EXPAND_FLIP_MS,
  usePanelExpandFlip,
} from './usePanelExpandFlip';

const prefersReduced = vi.hoisted(() => ({ current: false }));

vi.mock('../lib/panelMorph', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/panelMorph')>();
  return {
    ...actual,
    prefersReducedMotion: () => prefersReduced.current,
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function FlipHarness({
  initialExpanded = false,
}: {
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const panelRef = useRef<HTMLDivElement>(null);
  usePanelExpandFlip(expanded, panelRef);
  return createElement(
    'div',
    null,
    createElement('div', {
      ref: panelRef,
      'data-testid': 'panel',
      style: {
        position: 'fixed',
        width: expanded ? 400 : 200,
        height: expanded ? 600 : 300,
        left: expanded ? 0 : 100,
        top: expanded ? 0 : 80,
      },
    }),
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'toggle',
        onClick: () => setExpanded(v => !v),
      },
      'toggle',
    ),
  );
}

describe('usePanelExpandFlip', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    prefersReduced.current = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // Fake rAF only so play runs without firing the safety finish timeout.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('exports PANEL_EXPAND_FLIP_MS and usePanelExpandFlip', () => {
    expect(typeof usePanelExpandFlip).toBe('function');
    expect(PANEL_EXPAND_FLIP_MS).toBeGreaterThan(0);
    expect(PANEL_EXPAND_FLIP_MS).toBeLessThanOrEqual(400);
  });

  it('applies invert transform then plays to identity on expand', () => {
    act(() => {
      root.render(createElement(FlipHarness));
    });

    const panel = container.querySelector('[data-testid="panel"]') as HTMLDivElement;
    // jsdom rects are empty — stub First/Last so invert is non-identity.
    let expanded = false;
    vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
      if (!expanded) {
        return {
          x: 100,
          y: 80,
          width: 200,
          height: 300,
          top: 80,
          left: 100,
          right: 300,
          bottom: 380,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        width: 400,
        height: 600,
        top: 0,
        left: 0,
        right: 400,
        bottom: 600,
        toJSON: () => ({}),
      } as DOMRect;
    });

    // Refresh cached First rect under the spy (mount measured zeros).
    act(() => {
      root.render(createElement(FlipHarness));
    });
    expect(panel.style.transform).toBe('');

    expanded = true;
    act(() => {
      (container.querySelector('[data-testid="toggle"]') as HTMLButtonElement).click();
    });

    // Invert applied synchronously in useLayoutEffect.
    expect(panel.style.transform).toMatch(/translate\(|scale\(/);
    expect(panel.style.transition).toBe('none');

    act(() => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });

    // After play rAF(s), transform is cleared toward identity ('none').
    expect(panel.style.transform).toBe('none');
    expect(panel.style.transition).toMatch(/transform/);
  });

  it('skips transform when prefers-reduced-motion', () => {
    prefersReduced.current = true;

    act(() => {
      root.render(createElement(FlipHarness));
    });

    const panel = container.querySelector('[data-testid="panel"]') as HTMLDivElement;

    act(() => {
      (container.querySelector('[data-testid="toggle"]') as HTMLButtonElement).click();
    });

    expect(panel.style.transform).toBe('');
    expect(panel.style.transition).toBe('');
  });
});
