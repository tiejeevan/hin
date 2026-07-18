/** Header value that opts a fetch out of the global loading overlay. */
export const SILENT_LOADING_HEADER = 'X-Hin-Loading';
export const SILENT_LOADING_VALUE = 'silent';

const SHOW_DELAY_MS = 150;
const MIN_VISIBLE_MS = 250;

const SILENT_URL_SUFFIXES = ['/api/me/session-tick'];

/**
 * Instant user-interaction mutations: like, bookmark, comment, follow, etc.
 * These must not drive the full-screen overlay (Durable Object fan-out is separate).
 * Heavy writes (create/delete post, auth, admin, profile save) are intentionally excluded.
 */
const SILENT_INTERACTION_RULES: Array<{ method: string; pattern: RegExp }> = [
  // Posts: like / bookmark / share / pin / poll
  { method: 'POST', pattern: /\/api\/posts\/\d+\/like(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/posts\/\d+\/bookmark(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/posts\/\d+\/share(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/posts\/\d+\/pin(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/posts\/\d+\/pin(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/posts\/\d+\/poll\/vote(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/posts\/\d+\/poll\/vote(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/posts\/\d+\/poll\/close(?:\?|$)/ },
  // Comments
  { method: 'POST', pattern: /\/api\/posts\/\d+\/comments(?:\?|$)/ },
  { method: 'PUT', pattern: /\/api\/comments\/\d+(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/comments\/\d+(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/comments\/\d+\/like(?:\?|$)/ },
  // Olabid / item comments
  { method: 'POST', pattern: /\/api\/olabid\/items\/\d+\/bookmark(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/olabid\/items\/\d+\/comments(?:\?|$)/ },
  { method: 'PUT', pattern: /\/api\/item-comments\/\d+(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/item-comments\/\d+(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/item-comments\/\d+\/like(?:\?|$)/ },
  // Social graph
  { method: 'POST', pattern: /\/api\/follows\/\d+(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/follows\/\d+(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/follows\/\d+\/request(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/follows\/requests\/\d+\/approve(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/follows\/requests\/\d+\/reject(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/blocks\/\d+(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/blocks\/\d+(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/mutes\/\d+(?:\?|$)/ },
  { method: 'DELETE', pattern: /\/api\/mutes\/\d+(?:\?|$)/ },
  // Notifications / chat read receipts
  { method: 'POST', pattern: /\/api\/notifications\/\d+\/read(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/notifications\/read-all(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/messages\/read\/\d+(?:\?|$)/ },
  // Light taps
  { method: 'POST', pattern: /\/api\/events\/\d+\/join(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/me\/bio-walkthrough\/complete(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/me\/intro-walkthrough\/complete(?:\?|$)/ },
  { method: 'PATCH', pattern: /\/api\/me\/gamification\/equipped(?:\?|$)/ },
  { method: 'PATCH', pattern: /\/api\/users\/me\/settings(?:\?|$)/ },
  { method: 'POST', pattern: /\/api\/reports(?:\?|$)/ },
];

type Listener = (visible: boolean) => void;

let pendingCount = 0;
let visible = false;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let visibleSince = 0;
const listeners = new Set<Listener>();
let fetchInstalled = false;

function notify() {
  for (const listener of listeners) {
    listener(visible);
  }
}

function scheduleShow() {
  if (visible || showTimer) return;
  showTimer = setTimeout(() => {
    showTimer = null;
    if (pendingCount > 0) {
      visible = true;
      visibleSince = Date.now();
      notify();
    }
  }, SHOW_DELAY_MS);
}

function scheduleHide() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (!visible) return;

  const elapsed = Date.now() - visibleSince;
  const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (pendingCount === 0) {
      visible = false;
      notify();
    }
  }, remaining);
}

export function beginLoading(): void {
  pendingCount += 1;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (pendingCount === 1) {
    scheduleShow();
  }
}

export function endLoading(): void {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount === 0) {
    scheduleHide();
  }
}

export async function trackLoading<T>(promise: Promise<T>): Promise<T> {
  beginLoading();
  try {
    return await promise;
  } finally {
    endLoading();
  }
}

export function subscribeGlobalLoading(listener: Listener): () => void {
  listeners.add(listener);
  listener(visible);
  return () => {
    listeners.delete(listener);
  };
}

export function isGlobalLoadingVisible(): boolean {
  return visible;
}

/** Headers that opt a single fetch out of the global overlay. */
export function silentLoadingHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    [SILENT_LOADING_HEADER]: SILENT_LOADING_VALUE,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = init?.method;
  if (fromInit) return fromInit.toUpperCase();
  if (input instanceof Request && input.method) return input.method.toUpperCase();
  return 'GET';
}

function hasSilentHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headerFromInit = init?.headers;
  if (headerFromInit) {
    if (headerFromInit instanceof Headers) {
      if (headerFromInit.get(SILENT_LOADING_HEADER)?.toLowerCase() === SILENT_LOADING_VALUE) {
        return true;
      }
    } else if (Array.isArray(headerFromInit)) {
      for (const [key, value] of headerFromInit) {
        if (
          key.toLowerCase() === SILENT_LOADING_HEADER.toLowerCase() &&
          value.toLowerCase() === SILENT_LOADING_VALUE
        ) {
          return true;
        }
      }
    } else {
      for (const [key, value] of Object.entries(headerFromInit)) {
        if (
          key.toLowerCase() === SILENT_LOADING_HEADER.toLowerCase() &&
          String(value).toLowerCase() === SILENT_LOADING_VALUE
        ) {
          return true;
        }
      }
    }
  }

  if (input instanceof Request) {
    const value = input.headers.get(SILENT_LOADING_HEADER);
    if (value?.toLowerCase() === SILENT_LOADING_VALUE) return true;
  }

  return false;
}

function isSilentInteraction(url: string, method: string): boolean {
  return SILENT_INTERACTION_RULES.some(
    (rule) => rule.method === method && rule.pattern.test(url),
  );
}

export function isSilentRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = requestUrl(input);
  if (SILENT_URL_SUFFIXES.some((suffix) => url.includes(suffix))) {
    return true;
  }

  if (hasSilentHeader(input, init)) {
    return true;
  }

  const method = requestMethod(input, init);
  if (isSilentInteraction(url, method)) {
    return true;
  }

  return false;
}

/** Wrap window.fetch once so non-silent requests drive the global overlay. */
export function installGlobalFetchLoading(): void {
  if (typeof window === 'undefined' || fetchInstalled) return;
  fetchInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const silent = isSilentRequest(input, init);
    if (!silent) beginLoading();
    try {
      return await originalFetch(input, init);
    } finally {
      if (!silent) endLoading();
    }
  };
}
