import { describe, it, expect, afterEach, vi } from 'vitest';
import { SILENT_LOADING_HEADER, SILENT_LOADING_VALUE } from './globalLoading';

/**
 * Instant taps (like/comment/bookmark) are auto-silent so GlobalLoadingOverlay
 * does not block the UI. Data loads (GET) and heavy writes (create post) still
 * drive the overlay after SHOW_DELAY_MS.
 */
describe('global fetch loading', () => {
  let originalFetch: typeof fetch;

  afterEach(() => {
    vi.useRealTimers();
    window.fetch = originalFetch;
  });

  async function loadFreshModule() {
    vi.resetModules();
    vi.useFakeTimers();
    originalFetch = window.fetch;
    return import('./globalLoading');
  }

  it('does NOT show overlay for POST /like (auto-silent interaction)', async () => {
    const mod = await loadFreshModule();

    let resolveFetch!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    window.fetch = vi.fn(() => fetchPromise) as unknown as typeof fetch;
    mod.installGlobalFetchLoading();

    const pending = window.fetch('http://localhost:8787/api/posts/1/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(mod.isGlobalLoadingVisible()).toBe(false);

    resolveFetch(new Response(JSON.stringify({ liked: true, likesCount: 1 }), { status: 200 }));
    await pending;
    await vi.advanceTimersByTimeAsync(500);
    expect(mod.isGlobalLoadingVisible()).toBe(false);
  });

  it('does NOT show overlay for POST /bookmark or comment create', async () => {
    const mod = await loadFreshModule();

    window.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    mod.installGlobalFetchLoading();

    await window.fetch('http://localhost:8787/api/posts/2/bookmark', { method: 'POST' });
    await window.fetch('http://localhost:8787/api/posts/2/comments', {
      method: 'POST',
      body: '{}',
    });
    await window.fetch('http://localhost:8787/api/olabid/items/9/bookmark', { method: 'POST' });
    await window.fetch('http://localhost:8787/api/comments/9/like', { method: 'POST' });

    await vi.advanceTimersByTimeAsync(500);
    expect(mod.isGlobalLoadingVisible()).toBe(false);
  });

  it('shows overlay for GET data loads after show delay', async () => {
    const mod = await loadFreshModule();

    let resolveFetch!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    window.fetch = vi.fn(() => fetchPromise) as unknown as typeof fetch;
    mod.installGlobalFetchLoading();

    const pending = window.fetch('http://localhost:8787/api/posts?limit=20', {
      headers: { Authorization: 'Bearer x' },
    });

    await vi.advanceTimersByTimeAsync(149);
    expect(mod.isGlobalLoadingVisible()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(mod.isGlobalLoadingVisible()).toBe(true);

    resolveFetch(new Response('[]', { status: 200 }));
    await pending;
    await vi.advanceTimersByTimeAsync(250);
    expect(mod.isGlobalLoadingVisible()).toBe(false);
  });

  it('shows overlay for heavy POST /api/posts create', async () => {
    const mod = await loadFreshModule();

    let resolveFetch!: (r: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    window.fetch = vi.fn(() => fetchPromise) as unknown as typeof fetch;
    mod.installGlobalFetchLoading();

    const pending = window.fetch('http://localhost:8787/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    await vi.advanceTimersByTimeAsync(150);
    expect(mod.isGlobalLoadingVisible()).toBe(true);

    await vi.advanceTimersByTimeAsync(50);
    resolveFetch(new Response('{}', { status: 200 }));
    await pending;

    expect(mod.isGlobalLoadingVisible()).toBe(true);
    await vi.advanceTimersByTimeAsync(199);
    expect(mod.isGlobalLoadingVisible()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(mod.isGlobalLoadingVisible()).toBe(false);
  });

  it('does NOT show overlay when X-Hin-Loading: silent is set', async () => {
    const mod = await loadFreshModule();

    window.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    mod.installGlobalFetchLoading();

    const pending = window.fetch('http://localhost:8787/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SILENT_LOADING_HEADER]: SILENT_LOADING_VALUE,
      },
      body: '{}',
    });

    await vi.advanceTimersByTimeAsync(500);
    await pending;
    await vi.advanceTimersByTimeAsync(500);

    expect(mod.isGlobalLoadingVisible()).toBe(false);
  });

  it('session-tick is silent by URL; GET /posts is not', async () => {
    const mod = await loadFreshModule();

    let resolvePosts!: (r: Response) => void;
    const postsPromise = new Promise<Response>((resolve) => {
      resolvePosts = resolve;
    });

    window.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/posts')) return postsPromise;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;
    mod.installGlobalFetchLoading();

    await window.fetch('http://localhost:8787/api/me/session-tick');
    await vi.advanceTimersByTimeAsync(500);
    expect(mod.isGlobalLoadingVisible()).toBe(false);

    const postsPending = window.fetch('http://localhost:8787/api/posts?limit=10');
    await vi.advanceTimersByTimeAsync(150);
    expect(mod.isGlobalLoadingVisible()).toBe(true);

    resolvePosts(new Response('[]', { status: 200 }));
    await postsPending;
    await vi.advanceTimersByTimeAsync(250);
    expect(mod.isGlobalLoadingVisible()).toBe(false);
  });
});
