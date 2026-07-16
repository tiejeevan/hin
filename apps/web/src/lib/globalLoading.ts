/** Header value that opts a fetch out of the global loading overlay. */
export const SILENT_LOADING_HEADER = 'X-Hin-Loading';
export const SILENT_LOADING_VALUE = 'silent';

const SHOW_DELAY_MS = 150;
const MIN_VISIBLE_MS = 250;

const SILENT_URL_SUFFIXES = ['/api/me/session-tick'];

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

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isSilentRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = requestUrl(input);
  if (SILENT_URL_SUFFIXES.some((suffix) => url.includes(suffix))) {
    return true;
  }

  const headerFromInit = init?.headers;
  if (headerFromInit) {
    if (headerFromInit instanceof Headers) {
      if (headerFromInit.get(SILENT_LOADING_HEADER)?.toLowerCase() === SILENT_LOADING_VALUE) {
        return true;
      }
    } else if (Array.isArray(headerFromInit)) {
      for (const [key, value] of headerFromInit) {
        if (key.toLowerCase() === SILENT_LOADING_HEADER.toLowerCase() && value.toLowerCase() === SILENT_LOADING_VALUE) {
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
