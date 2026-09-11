import { test, expect } from '@playwright/test';
import { uniqueUsername, DEFAULT_PASSWORD } from './helpers/auth';
import {
  createPostViaApi,
  registerViaApi,
  setPrivateViaApi,
} from './helpers/follows';

const WEB_URL = process.env.PLAYWRIGHT_WEB_URL ?? 'http://localhost:5173';
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

test.describe('SEO', () => {
  test('sitemap.xml is valid XML with public content', async () => {
    const res = await fetch(`${WEB_URL}/sitemap.xml`);
    expect(res.ok).toBe(true);
    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType.toLowerCase()).toContain('xml');

    const body = await res.text();
    expect(body.startsWith('<?xml')).toBe(true);
    expect(body).toContain('<loc>');
    expect(body).toContain(`${WEB_URL.replace(/\/$/, '')}/`);
  });

  test('robots.txt blocks AI crawlers and lists sitemap', async () => {
    const res = await fetch(`${WEB_URL}/robots.txt`);
    expect(res.ok).toBe(true);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('gptbot');
    expect(body).toContain(`Sitemap: ${WEB_URL.replace(/\/$/, '')}/sitemap.xml`);
    expect(body).toContain('Disallow: /olabid/');
  });

  test('public post is indexable; protected-account public post is not', async () => {
    const publicUser = uniqueUsername('seo_public');
    const privateUser = uniqueUsername('seo_private');

    const publicAccount = await registerViaApi(publicUser, DEFAULT_PASSWORD);
    const privateAccount = await registerViaApi(privateUser, DEFAULT_PASSWORD);
    await setPrivateViaApi(privateAccount.token);

    const publicContent = `SEO public post ${Date.now()}`;
    const protectedContent = `SEO protected public post ${Date.now()}`;

    const publicPost = await createPostViaApi(publicAccount.token, publicContent, { visibility: 'public' });
    const protectedPost = await createPostViaApi(privateAccount.token, protectedContent, { visibility: 'public' });

    const publicPreviewRes = await fetch(`${API_URL}/api/seo/share-preview/post/${publicPost.id}`);
    expect(publicPreviewRes.ok).toBe(true);
    const publicPreview = await publicPreviewRes.json();
    expect(publicPreview.robots).toBe('index,follow');
    expect(publicPreview.isPublic).toBe(true);

    const protectedPreviewRes = await fetch(`${API_URL}/api/seo/share-preview/post/${protectedPost.id}`);
    expect(protectedPreviewRes.ok).toBe(true);
    const protectedPreview = await protectedPreviewRes.json();
    expect(protectedPreview.robots).toBe('noindex,nofollow');
    expect(protectedPreview.isPublic).toBe(false);

    const sitemapRes = await fetch(`${API_URL}/sitemap.xml`);
    const sitemap = await sitemapRes.text();
    expect(sitemap).toContain(`/post/${publicPost.id}`);
    expect(sitemap).not.toContain(`/post/${protectedPost.id}`);
  });

  test('private profile excluded from sitemap', async () => {
    const privateUser = uniqueUsername('seo_prof_private');
    const account = await registerViaApi(privateUser, DEFAULT_PASSWORD);
    await setPrivateViaApi(account.token);

    const sitemapRes = await fetch(`${API_URL}/sitemap.xml`);
    const sitemap = await sitemapRes.text();
    expect(sitemap).not.toContain(`/profile/${encodeURIComponent(privateUser)}`);
  });

  test('SEO health endpoint returns configured origins', async () => {
    const res = await fetch(`${API_URL}/api/seo/health`);
    expect(res.ok).toBe(true);
    const health = await res.json();
    expect(typeof health.siteUrl).toBe('string');
    expect(typeof health.apiOrigin).toBe('string');
    expect(typeof health.cacheRowCount).toBe('number');
    expect(typeof health.publicRowCount).toBe('number');
  });
});
