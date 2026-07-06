import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import {
  createPostRawViaApi,
  editPostViaApi,
  getSystemSettingsViaApi,
  setPostLimitsViaApi,
} from './helpers/post-limits';

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

test.describe('Post limits API', () => {
  test('authenticated users can read system post limits', async () => {
    const user = await registerViaApi(uniqueUsername('limits_read'), DEFAULT_PASSWORD);
    const { status, data } = await getSystemSettingsViaApi(user.token);
    expect(status).toBe(200);
    expect(data.maxPostLength).toBeGreaterThan(0);
    expect(data.maxMediaPerPost).toBeGreaterThanOrEqual(0);
  });

  test('rejects posts over max length', async () => {
    const adminToken = await loginAdminViaApi();
    const set = await setPostLimitsViaApi(adminToken, { maxPostLength: 100 });
    expect(set.status).toBe(200);

    const user = await registerViaApi(uniqueUsername('limits_len'), DEFAULT_PASSWORD);
    const ok = await createPostViaApi(user.token, 'x'.repeat(100));
    expect(ok.id).toBeTruthy();

    const tooLong = await createPostRawViaApi(user.token, { content: 'x'.repeat(101) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.data.error).toMatch(/too long/i);

    await setPostLimitsViaApi(adminToken, { maxPostLength: 1000 });
  });

  test('rejects posts with too many media URLs', async () => {
    const adminToken = await loginAdminViaApi();
    await setPostLimitsViaApi(adminToken, { maxMediaPerPost: 1 });

    const user = await registerViaApi(uniqueUsername('limits_media'), DEFAULT_PASSWORD);
    const tooMany = await createPostRawViaApi(user.token, {
      content: 'Media limit test',
      mediaUrls: [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
      ],
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.data.error).toMatch(/maximum 1 image/i);

    await setPostLimitsViaApi(adminToken, { maxMediaPerPost: 5 });
  });

  test('edit post enforces max length', async () => {
    const adminToken = await loginAdminViaApi();
    const set = await setPostLimitsViaApi(adminToken, { maxPostLength: 100 });
    expect(set.status).toBe(200);

    const user = await registerViaApi(uniqueUsername('limits_edit'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(user.token, 'Short post');
    const edited = await editPostViaApi(user.token, post.id, 'x'.repeat(101));
    expect(edited.status).toBe(400);
    expect(edited.data.error).toMatch(/too long/i);

    await setPostLimitsViaApi(adminToken, { maxPostLength: 1000 });
  });
});
