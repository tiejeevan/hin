import { expect, type Page } from '@playwright/test';
import { expandSettingsSection, openProfileSettings, settingsPanel } from './settings';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8787';

export async function muteViaApi(token: string, userId: number) {
  const res = await fetch(`${API_URL}/api/mutes/${userId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Mute failed: ${await res.text()}`);
  return res.json();
}

export async function unmuteViaApi(token: string, userId: number) {
  const res = await fetch(`${API_URL}/api/mutes/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Unmute failed: ${await res.text()}`);
  return res.json();
}

export async function blockViaApi(token: string, userId: number) {
  const res = await fetch(`${API_URL}/api/blocks/${userId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`Block failed: ${await res.text()}`);
  return res.json();
}

export async function unblockViaApi(token: string, userId: number) {
  const res = await fetch(`${API_URL}/api/blocks/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Unblock failed: ${await res.text()}`);
  return res.json();
}

export async function likePostViaApi(token: string, postId: number) {
  const res = await fetch(`${API_URL}/api/posts/${postId}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Like failed: ${await res.text()}`);
  return res.json();
}

export async function openProfileForUsername(page: Page, username: string) {
  await page.getByRole('button', { name: username, exact: true }).first().click();
}

export async function muteFromProfile(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
}

export async function blockFromProfile(page: Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Block', exact: true }).click();
}

export async function expandBlockedMutedSection(page: Page) {
  await openProfileSettings(page);
  await expandSettingsSection(page, 'Blocked & muted');
}

export async function expectUserNotFoundOnProfile(page: Page) {
  await expect(page.getByText('User not found')).toBeVisible();
}

export async function fetchNotificationsViaApi(token: string) {
  const res = await fetch(`${API_URL}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Fetch notifications failed: ${await res.text()}`);
  return res.json();
}

export { openProfileSettings, settingsPanel };
