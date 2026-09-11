import { describe, expect, it } from 'vitest';
import { linkPreviewBotUserAgent, resolveSiteUrls } from './siteUrl';

describe('resolveSiteUrls', () => {
  it('uses explicit env vars in production', () => {
    expect(resolveSiteUrls({
      SITE_URL: 'https://hingot.com',
      API_PUBLIC_URL: 'https://hingot.com',
    })).toEqual({
      siteUrl: 'https://hingot.com',
      apiOrigin: 'https://hingot.com',
    });
  });

  it('infers local web origin from API dev server', () => {
    expect(resolveSiteUrls({}, 'http://localhost:8787')).toEqual({
      siteUrl: 'http://localhost:5173',
      apiOrigin: 'http://localhost:8787',
    });
  });

  it('prefers SITE_URL over inferred local web origin', () => {
    expect(resolveSiteUrls({
      SITE_URL: 'http://192.168.1.5:5173',
      API_PUBLIC_URL: 'http://192.168.1.5:8787',
    }, 'http://localhost:8787')).toEqual({
      siteUrl: 'http://192.168.1.5:5173',
      apiOrigin: 'http://192.168.1.5:8787',
    });
  });

  it('throws when SITE_URL is unset and origin is not a local API dev server', () => {
    expect(() => resolveSiteUrls({}, 'https://hin.tiejeevan.workers.dev')).toThrow(
      /SITE_URL is not configured/,
    );
  });
});

describe('linkPreviewBotUserAgent', () => {
  it('omits site suffix when URL is unknown', () => {
    expect(linkPreviewBotUserAgent()).toBe('Mozilla/5.0 (compatible; HinLinkPreviewBot/1.0)');
  });

  it('includes site URL when provided', () => {
    expect(linkPreviewBotUserAgent('https://hingot.com')).toContain('+https://hingot.com');
  });
});
