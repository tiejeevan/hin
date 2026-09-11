import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, loginUser, uniqueUsername } from './helpers/auth';
import {
  createPostViaApi,
  registerViaApi,
} from './helpers/follows';
import {
  expandSettingsSection,
  getSettingsViaApi,
  openOwnProfile,
  openProfileSettings,
  patchSettingsViaApi,
} from './helpers/settings';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

test.describe('Performance smoke', () => {
  test('privacy toggle PATCH responds quickly and persists', async ({ page }) => {
    const username = uniqueUsername('perf_privacy');
    const { token } = await registerViaApi(username, DEFAULT_PASSWORD);

    for (let i = 0; i < 5; i++) {
      await createPostViaApi(token, `Perf e2e post ${i} ${Date.now()}`);
    }

    await loginUser(page, username);
    await openOwnProfile(page, username);
    await openProfileSettings(page);
    await expandSettingsSection(page, 'Privacy');

    const sw = page.getByRole('switch', { name: 'Private account' });
    await expect(sw).toHaveAttribute('aria-checked', 'false');

    const patch = page.waitForResponse(
      res =>
        res.url().includes('/api/users/me/settings') &&
        res.request().method() === 'PATCH' &&
        res.ok(),
      { timeout: 10_000 },
    );

    const start = Date.now();
    await sw.click();
    const res = await patch;
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10_000);
    expect(res.status()).toBe(200);

    const settings = await getSettingsViaApi(token);
    expect(settings.isPrivate).toBe(true);
    await expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  test('privacy toggle via API updates share preview visibility', async () => {
    const username = uniqueUsername('perf_seo');
    const { token } = await registerViaApi(username, DEFAULT_PASSWORD);

    const post = await createPostViaApi(token, `SEO perf ${Date.now()}`);
    const postId = post.id as number;

    const before = await fetch(`${API_URL}/api/seo/share-preview/post/${postId}`);
    expect(before.ok).toBe(true);
    const beforeJson = await before.json();
    expect(beforeJson.isPublic).toBe(true);

    await patchSettingsViaApi(token, { isPrivate: true });

    const deadline = Date.now() + 10_000;
    let isPublic = true;
    while (Date.now() < deadline) {
      const res = await fetch(`${API_URL}/api/seo/share-preview/post/${postId}`);
      const json = await res.json();
      isPublic = json.isPublic;
      if (!isPublic) break;
      await new Promise(r => setTimeout(r, 250));
    }

    expect(isPublic).toBe(false);
  });
});
