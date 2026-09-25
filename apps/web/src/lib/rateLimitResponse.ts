export type RateLimitBlockState = {
  error: string;
  retryAfterSeconds: number | null;
};

export const DEFAULT_RATE_LIMIT_MESSAGE =
  'Too many requests. Please wait a moment and try again.';

export function rateLimitBlockFromBody(data: unknown): RateLimitBlockState | null {
  if (!data || typeof data !== 'object') return null;
  const code = (data as { code?: string }).code;
  if (code !== 'rate_limit') return null;
  const body = data as { error?: string; retryAfterSeconds?: number };
  const retryAfterSeconds =
    typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0
      ? body.retryAfterSeconds
      : null;
  return {
    error: body.error?.trim() || DEFAULT_RATE_LIMIT_MESSAGE,
    retryAfterSeconds,
  };
}

export function formatRetryCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
