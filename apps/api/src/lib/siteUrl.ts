import type { Env } from '../types';

export type SiteUrlEnv = Pick<Env, 'SITE_URL' | 'API_PUBLIC_URL'>;

export interface ResolvedSiteUrls {
  siteUrl: string;
  apiOrigin: string;
}

/** Map local API dev origin to the Vite web dev server origin. */
function inferLocalWebOrigin(apiOrigin: string): string | undefined {
  if (apiOrigin.includes('localhost:8787')) return 'http://localhost:5173';
  if (apiOrigin.includes('127.0.0.1:8787')) return 'http://127.0.0.1:5173';
  return undefined;
}

/**
 * Resolve public web + API origins.
 * SITE_URL is the web app (e.g. http://localhost:5173 or https://hingot.com).
 * API_PUBLIC_URL serves /api/media (defaults to SITE_URL, then request origin).
 */
export function resolveSiteUrls(env: SiteUrlEnv, requestOrigin?: string): ResolvedSiteUrls {
  const origin = requestOrigin?.replace(/\/$/, '');
  const apiOrigin = (env.API_PUBLIC_URL || env.SITE_URL || origin || '').replace(/\/$/, '');
  const siteUrl = (env.SITE_URL || inferLocalWebOrigin(apiOrigin) || '').replace(/\/$/, '');

  if (!siteUrl) {
    throw new Error(
      'SITE_URL is not configured. Set SITE_URL to your web app origin (e.g. http://localhost:5173 or https://hingot.com).',
    );
  }

  return {
    siteUrl,
    apiOrigin: apiOrigin || siteUrl,
  };
}

export function linkPreviewBotUserAgent(siteUrl?: string): string {
  const base = 'Mozilla/5.0 (compatible; HinLinkPreviewBot/1.0';
  if (!siteUrl) return `${base})`;
  return `${base}; +${siteUrl.replace(/\/$/, '')})`;
}
