import { rateLimitBlockFromBody, type RateLimitBlockState } from './rateLimitResponse';

/** Intercept API 429 rate_limit responses so the UI can show a clear modal. */
export function installApiRateLimitObserver(
  apiUrl: string,
  onRateLimit: (state: RateLimitBlockState) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const normalizedApi = apiUrl.replace(/\/$/, '');
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if (res.status !== 429) return res;

    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    if (!url.startsWith(normalizedApi)) return res;

    try {
      const data = await res.clone().json();
      const block = rateLimitBlockFromBody(data);
      if (block) onRateLimit(block);
    } catch {
      onRateLimit({
        error: 'Too many requests. Please wait a moment and try again.',
        retryAfterSeconds: null,
      });
    }

    return res;
  };

  return () => {
    window.fetch = originalFetch;
  };
}
