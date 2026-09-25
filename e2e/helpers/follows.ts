import { expect, type Page } from '@playwright/test';
import {
  expandSettingsSection,
  openProfileSettings,
  settingsPanel,
} from './settings';

export { openProfileSettings, expandSettingsSection };

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function createTextPost(page: Page, content: string) {
  await page.locator('[aria-label="Create post"]').first().click();
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

export async function approveFollowRequest(page: Page, requesterUsername: string) {
  await openProfileSettings(page);
  await expandSettingsSection(page, 'Privacy');
  const panel = settingsPanel(page).getByRole('list');
  await expect(panel).toBeVisible();
  const row = panel.locator('li').filter({ hasText: requesterUsername });
  await row.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(panel.locator('li').filter({ hasText: requesterUsername })).toHaveCount(0);
}

export async function setPrivateAccount(page: Page) {
  await openProfileSettings(page);
  await expandSettingsSection(page, 'Privacy');
  await page.getByRole('switch', { name: 'Private account' }).click();
  await expect(page.getByText('Private', { exact: true })).toBeVisible();
}

export async function switchFeedMode(page: Page, mode: 'Everyone' | 'Following' | 'Saved') {
  await page.getByRole('button', { name: new RegExp(`^Feed: (Everyone|Following|Saved)$`) }).click();
  await page.getByRole('menuitem', { name: mode, exact: true }).click();
}

function uniqueRegisterEmail(prefix = 'e2e') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Distinct synthetic IP per call so register rate limits do not block e2e bursts. */
function e2eSyntheticIp(): string {
  const a = Math.floor(Math.random() * 200) + 1;
  const b = Math.floor(Math.random() * 200) + 1;
  return `10.254.${a}.${b}`;
}

export async function verifyRegistrationViaApi(token: string, code: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/verify-registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': e2eSyntheticIp(),
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Verify registration failed: ${await res.text()}`);
}

export async function registerViaApi(
  username: string,
  password: string,
  email?: string,
): Promise<{ token: string; userId: number }> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': e2eSyntheticIp(),
    },
    body: JSON.stringify({
      username,
      email: email ?? uniqueRegisterEmail(),
      password,
    }),
  });
  if (!res.ok) throw new Error(`Register failed: ${await res.text()}`);
  const data = await res.json();
  if (data.devVerificationCode) {
    await verifyRegistrationViaApi(data.token, data.devVerificationCode);
  } else if (!data.registrationComplete && data.user?.needsEmailVerification) {
    throw new Error('Registration requires email verification; configure OCI dev fallback or pass verification flow');
  }
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
  const res = await fetch(`${API_URL}/api/users/me/settings`, {
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
