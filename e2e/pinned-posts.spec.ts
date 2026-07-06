import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import {
  getProfilePostsViaApi,
  pinPostViaApi,
  setMaxPinsViaApi,
  unpinPostViaApi,
} from './helpers/pins';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

async function loginAdminViaApi(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '087425' }),
  });
  if (!res.ok) throw new Error(`Admin login failed: ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

test.describe('Pinned posts API', () => {
  test('pin respects default limit and profile order', async () => {
    const user = await registerViaApi(uniqueUsername('pin_user'), DEFAULT_PASSWORD);
    const older = await createPostViaApi(user.token, `Older ${Date.now()}`);
    const newer = await createPostViaApi(user.token, `Newer ${Date.now() + 1}`);

    const pinned = await pinPostViaApi(user.token, older.id);
    expect(pinned.status).toBe(200);
    expect(pinned.data.pinnedAt).toBeTruthy();

    const page = await getProfilePostsViaApi(user.token, user.userId);
    expect(page.posts[0].id).toBe(older.id);
    expect(page.posts.some((p: { id: number }) => p.id === newer.id)).toBe(true);

    const secondPin = await pinPostViaApi(user.token, newer.id);
    expect(secondPin.status).toBe(400);

    await unpinPostViaApi(user.token, older.id);
    const pageAfter = await getProfilePostsViaApi(user.token, user.userId);
    expect(pageAfter.posts[0].id).toBe(newer.id);
  });

  test('admin can raise pin limit', async () => {
    const adminToken = await loginAdminViaApi();
    const user = await registerViaApi(uniqueUsername('pin_limit'), DEFAULT_PASSWORD);
    const p1 = await createPostViaApi(user.token, 'Pin one');
    const p2 = await createPostViaApi(user.token, 'Pin two');

    await setMaxPinsViaApi(adminToken, 2);
    expect((await pinPostViaApi(user.token, p1.id)).status).toBe(200);
    expect((await pinPostViaApi(user.token, p2.id)).status).toBe(200);

    await setMaxPinsViaApi(adminToken, 1);
  });
});
