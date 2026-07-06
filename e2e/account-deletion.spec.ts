import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, uniqueUsername } from './helpers/auth';
import { createPostViaApi, registerViaApi } from './helpers/follows';
import {
  deleteAccountViaApi,
  getAdminStatsViaApi,
  getUserProfileViaApi,
  reinstateUserViaApi,
} from './helpers/account';

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

test.describe('Account deletion API', () => {
  test('self-delete hides profile and posts; admin sees status; reinstate restores', async () => {
    const user = await registerViaApi(uniqueUsername('del_user'), DEFAULT_PASSWORD);
    const post = await createPostViaApi(user.token, `Delete me ${Date.now()}`);

    const deleted = await deleteAccountViaApi(user.token, DEFAULT_PASSWORD);
    expect(deleted.status).toBe(200);
    expect(deleted.data.success).toBe(true);

    const profile = await getUserProfileViaApi(null, user.userId);
    expect(profile.status).toBe(404);

    const postsRes = await fetch(`${API_URL}/api/posts/${post.id}`);
    expect(postsRes.status).toBe(404);

    const adminToken = await loginAdminViaApi();
    const stats = await getAdminStatsViaApi(adminToken);
    const row = stats.users.find((u: { id: number }) => u.id === user.userId);
    expect(row?.accountStatus).toBe('self_deleted');

    const reinstated = await reinstateUserViaApi(adminToken, user.userId);
    expect(reinstated.status).toBe(200);
    expect(reinstated.data.success).toBe(true);

    const profileAfter = await getUserProfileViaApi(user.token, user.userId);
    expect(profileAfter.status).toBe(200);

    const postAfter = await fetch(`${API_URL}/api/posts/${post.id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(postAfter.status).toBe(200);
  });

  test('self-delete rejects wrong password', async () => {
    const user = await registerViaApi(uniqueUsername('del_bad_pw'), DEFAULT_PASSWORD);
    const res = await deleteAccountViaApi(user.token, 'wrong-password');
    expect(res.status).toBe(401);
  });
});
