import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useOverscrollBounce, type OverscrollBounceRef } from './useOverscrollBounce';

vi.mock('../lib/panelMorph', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/panelMorph')>();
  return {
    ...actual,
    prefersReducedMotion: () => false,
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HarnessProps = {
  enabled: boolean;
  showScroller: boolean;
  onRef: (ref: OverscrollBounceRef<HTMLDivElement>) => void;
};

function Harness({ enabled, showScroller, onRef }: HarnessProps) {
  const bounceRef = useOverscrollBounce<HTMLDivElement>(enabled);
  useEffect(() => {
    onRef(bounceRef);
  });
  if (!showScroller) return null;
  return createElement('div', {
    ref: bounceRef,
    'data-testid': 'scroller',
    style: { height: '100px', overflow: 'auto' },
  });
}

describe('useOverscrollBounce', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestRef: OverscrollBounceRef<HTMLDivElement> | null;

  const renderHarness = (props: Omit<HarnessProps, 'onRef'>) => {
    act(() => {
      root.render(
        createElement(Harness, {
          ...props,
          onRef: r => {
            latestRef = r;
          },
        }),
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    latestRef = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('binds when a node mounts with enabled=true', () => {
    renderHarness({ enabled: true, showScroller: true });
    const el = container.querySelector('[data-testid="scroller"]') as HTMLDivElement;
    expect(el).toBeTruthy();
    expect(latestRef?.current).toBe(el);

    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 50 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });

    const wheel = new WheelEvent('wheel', { deltaY: -40, cancelable: true });
    const prevented = !el.dispatchEvent(wheel);
    expect(prevented || wheel.defaultPrevented).toBe(true);
    expect(el.style.transform).toMatch(/translateY\(/);
  });

  it('unbinds on unmount and rebinds when a new node mounts', () => {
    renderHarness({ enabled: true, showScroller: true });
    const first = container.querySelector('[data-testid="scroller"]') as HTMLDivElement;
    expect(latestRef?.current).toBe(first);

    Object.defineProperty(first, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(first, 'scrollHeight', { configurable: true, value: 50 });
    Object.defineProperty(first, 'clientHeight', { configurable: true, value: 100 });
    first.dispatchEvent(new WheelEvent('wheel', { deltaY: -20, cancelable: true }));
    expect(first.style.transform).toMatch(/translateY\(/);

    // Simulate list → conversation (old node gone).
    renderHarness({ enabled: true, showScroller: false });
    expect(latestRef?.current).toBeNull();
    expect(first.style.transform).toBe('');

    // Simulate back to list (new node).
    renderHarness({ enabled: true, showScroller: true });
    const second = container.querySelector('[data-testid="scroller"]') as HTMLDivElement;
    expect(second).not.toBe(first);
    expect(latestRef?.current).toBe(second);

    Object.defineProperty(second, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(second, 'scrollHeight', { configurable: true, value: 50 });
    Object.defineProperty(second, 'clientHeight', { configurable: true, value: 100 });
    second.dispatchEvent(new WheelEvent('wheel', { deltaY: -20, cancelable: true }));
    expect(second.style.transform).toMatch(/translateY\(/);
  });

  it('does not bind when enabled=false, then binds after enabling with node mounted', () => {
    function ToggleHarness() {
      const [enabled, setEnabled] = useState(false);
      const bounceRef = useOverscrollBounce<HTMLDivElement>(enabled);
      useEffect(() => {
        latestRef = bounceRef;
      });
      return createElement(
        'div',
        null,
        createElement('div', {
          ref: bounceRef,
          'data-testid': 'scroller',
          style: { height: '100px', overflow: 'auto' },
        }),
        createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'enable',
            onClick: () => setEnabled(true),
          },
          'enable',
        ),
      );
    }

    act(() => {
      root.render(createElement(ToggleHarness));
    });

    const el = container.querySelector('[data-testid="scroller"]') as HTMLDivElement;
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 50 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });

    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -20, cancelable: true }));
    expect(el.style.transform).toBe('');

    act(() => {
      (container.querySelector('[data-testid="enable"]') as HTMLButtonElement).click();
    });

    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -20, cancelable: true }));
    expect(el.style.transform).toMatch(/translateY\(/);
  });

  it('applies wheel bump at bottom edge', () => {
    renderHarness({ enabled: true, showScroller: true });
    const el = container.querySelector('[data-testid="scroller"]') as HTMLDivElement;
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: 100 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 200 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });

    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, cancelable: true }));
    expect(el.style.transform).toMatch(/translateY\(-/);
  });
});
