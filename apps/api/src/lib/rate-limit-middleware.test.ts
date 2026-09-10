import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../types';
import {
  createGlobalRateLimitMiddleware,
  createWriteRateLimitMiddleware,
  rateLimitExceeded,
} from './rate-limit-middleware';
import { GLOBAL_API_IP } from './rate-limit-policy';

const consumeRateLimitMock = vi.fn();

vi.mock('./rate-limit', () => ({
  consumeRateLimit: (...args: unknown[]) => consumeRateLimitMock(...args),
}));

vi.mock('./auth', () => ({
  getJwtClaims: vi.fn().mockResolvedValue(null),
  isAdminJwtClaims: (claims: { role: string } | null) => claims?.role === 'admin',
}));

import { getJwtClaims } from './auth';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/*', createGlobalRateLimitMiddleware());
  app.use('/api/*', createWriteRateLimitMiddleware());
  app.get('/api/ping', (c) => c.json({ ok: true }));
  app.post('/api/ping', (c) => c.json({ ok: true }));
  app.get('/api/media/file.jpg', (c) => c.text('ok'));
  return app;
}

describe('rate limit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitMock.mockResolvedValue({ ok: true, remaining: 10 });
    vi.mocked(getJwtClaims).mockResolvedValue(null);
  });

  it('returns 429 when global limit is exceeded', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 12 });

    const app = createApp();
    const res = await app.request('http://localhost/api/ping', {
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    }, { DB: {} } as Env);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    const body = await res.json() as { code: string; retryAfterSeconds: number };
    expect(body.code).toBe('rate_limit');
    expect(body.retryAfterSeconds).toBe(12);
  });

  it('skips global limit for GET media paths', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/api/media/file.jpg', {
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    }, { DB: {} } as Env);

    expect(res.status).toBe(200);
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it('applies write limits to POST requests', async () => {
    const app = createApp();
    await app.request('http://localhost/api/ping', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    }, { DB: {} } as Env);

    expect(consumeRateLimitMock).toHaveBeenCalled();
    const keys = consumeRateLimitMock.mock.calls.map((call) => call[1]);
    expect(keys.some((key) => String(key).startsWith('api:global:ip:'))).toBe(true);
    expect(keys.some((key) => String(key).startsWith('api:write:ip:'))).toBe(true);
  });

  it('bypasses limits for admin JWT claims', async () => {
    vi.mocked(getJwtClaims).mockResolvedValue({ id: 1, role: 'admin' });

    const app = createApp();
    const res = await app.request('http://localhost/api/ping', {
      headers: {
        'CF-Connecting-IP': '203.0.113.1',
        Authorization: 'Bearer admin-token',
      },
    }, { DB: {} } as Env);

    expect(res.status).toBe(200);
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it('formats rateLimitExceeded responses', async () => {
    const app = new Hono();
    app.get('/test', (c) => rateLimitExceeded(c, { ok: false, retryAfterSeconds: 5 }, 'Slow down'));

    const res = await app.request('http://localhost/test');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    const body = await res.json() as { error: string; code: string };
    expect(body.error).toBe('Slow down');
    expect(body.code).toBe('rate_limit');
  });

  it('uses global policy window for global middleware', async () => {
    consumeRateLimitMock.mockResolvedValueOnce({ ok: true, remaining: 1 });

    const app = createApp();
    await app.request('http://localhost/api/ping', {
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    }, { DB: {} } as Env);

    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      'api:global:ip:203.0.113.9',
      GLOBAL_API_IP.limit,
      GLOBAL_API_IP.windowSec,
    );
  });
});
