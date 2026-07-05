import { expect, type Page } from '@playwright/test';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function createTextPost(page: Page, content: string) {
  await page.getByRole('button', { name: 'Create Post' }).first().click();
  await page.getByPlaceholder('What is on your mind?').fill(content);
  await page.getByRole('button', { name: 'Publish post' }).click();
  await expect(page.getByText(content)).toBeVisible();
}

export async function openProfileForUsername(page: Page, username: string) {
  await page.getByRole('button', { name: username, exact: true }).first().click();
}

export async function followFromProfile(page: Page) {
  await page.getByRole('button', { name: 'Follow' }).click();
}

export async function requestFollowFromProfile(page: Page) {
  await page.getByRole('button', { name: 'Request' }).click();
}

export async function openProfileSettings(page: Page) {
  await page.getByRole('button', { name: 'Profile settings' }).click();
}

export async function approveFollowRequest(page: Page, requesterUsername: string) {
  await openProfileSettings(page);
  const panel = page.locator('#follow-requests-panel');
  await expect(panel).toBeVisible();
  const row = panel.locator('li').filter({ hasText: requesterUsername });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(panel.locator('li').filter({ hasText: requesterUsername })).toHaveCount(0);
}

export async function setPrivateAccount(page: Page) {
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.getByRole('switch', { name: 'Private account' }).click();
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Private')).toBeVisible();
}

export async function switchFeedMode(page: Page, mode: 'Everyone' | 'Following') {
  await page.getByRole('button', { name: mode, exact: true }).click();
}

export async function registerViaApi(username: string, password: string): Promise<{ token: string; userId: number }> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Register failed: ${await res.text()}`);
  const data = await res.json();
  return { token: data.token, userId: data.user.id };
}

export async function createPostViaApi(
  token: string,
  content: string,
  opts?: { visibility?: 'public' | 'followers' | 'only_me' },
) {
  const res = await fetch(`${API_URL}/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      content,
      ...(opts?.visibility ? { visibility: opts.visibility } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Create post failed: ${await res.text()}`);
  return res.json();
}

export async function setPrivateViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isPrivate: true }),
  });
  if (!res.ok) throw new Error(`Set private failed: ${await res.text()}`);
}

export async function sendFollowRequestViaApi(token: string, targetUserId: number) {
  const res = await fetch(`${API_URL}/api/follows/${targetUserId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Follow request failed: ${await res.text()}`);
  return res.json();
}

export async function followViaApi(token: string, targetUserId: number) {
  return sendFollowRequestViaApi(token, targetUserId);
}
